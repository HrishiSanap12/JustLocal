# Justlocal: features, technology and how they work

This guide explains every feature in Justlocal: what it does, which technology it uses, where the code lives, and how it works. Paths are relative to the repository root.

## Contents

1. [The big picture](#1-the-big-picture)
2. [Technology stack](#2-technology-stack)
3. [Customer accounts and email verification](#3-customer-accounts-and-email-verification)
4. [Google and Apple sign-in](#4-google-and-apple-sign-in)
5. [Medicine catalog (Indian medicines dataset)](#5-medicine-catalog-indian-medicines-dataset)
6. [Search and categories](#6-search-and-categories)
7. [Delivery location and address search](#7-delivery-location-and-address-search)
8. [Prescription upload and OCR](#8-prescription-upload-and-ocr)
9. [Medicine requests and pharmacy matching](#9-medicine-requests-and-pharmacy-matching)
10. [Pharmacist review and offers](#10-pharmacist-review-and-offers)
11. [Choosing an offer and orders](#11-choosing-an-offer-and-orders)
12. [Refill reminders](#12-refill-reminders)
13. [Family profiles](#13-family-profiles)
14. [Medicine chatbot ("Ask")](#14-medicine-chatbot-ask)
15. [Payments (Razorpay)](#15-payments-razorpay)
16. [Pharmacist website](#16-pharmacist-website)
17. [Pharmacy registration and verification](#17-pharmacy-registration-and-verification)
18. [Admin console and performance metrics](#18-admin-console-and-performance-metrics)
19. [Mobile app design system and animations](#19-mobile-app-design-system-and-animations)
20. [Configuration reference](#20-configuration-reference)
21. [Scripts and testing](#21-scripts-and-testing)
22. [Known limitations](#22-known-limitations)

---

## 1. The big picture

Justlocal connects customers with nearby pharmacies:

> **Customer request → nearby matching pharmacies → pharmacist review and offer → customer chooses an offer → order tracking**

There are three apps and one shared backend:

| Part | Who uses it | Folder |
|---|---|---|
| Customer mobile app | Customers | `frontend/` |
| Pharmacist website and admin console | Pharmacy staff and administrators | `pharmacist-web/` |
| API server | Both apps | `backend/` |
| Database | The API server | MongoDB (Atlas in this setup) |

The backend enforces every rule: who can see what, which pharmacies get a request, and when an order may be created. Hiding a button in an app is never the security boundary.

```
 Customer app (Expo)            Pharmacist website (React + Vite)
        │                                   │
        └──────────────► FastAPI ◄──────────┘
                           │
             ┌─────────────┼───────────────┬───────────────┐
          MongoDB      Gmail SMTP       Veryfi /        Photon
                       or Resend        Tesseract     (OpenStreetMap)
```

## 2. Technology stack

| Layer | Technology | Notes |
|---|---|---|
| Customer app | Expo SDK 57, React Native 0.86, Expo Router, TypeScript | Runs on iOS, Android and web (`react-native-web`) |
| App animations | `react-native-reanimated` 4 | Tab bar and screen transitions |
| App images | `expo-image` | Medicine pack photos |
| App maps | `react-native-maps` (phones), `react-leaflet` (web) | Delivery pin |
| Pharmacist website | React 19, Vite 6, TypeScript, `lucide-react` icons, `react-leaflet` | Also hosts the admin console at `/admin` |
| Charts | Hand-written SVG components | `pharmacist-web/src/Charts.tsx`; no chart library |
| API | Python 3.13, FastAPI, Uvicorn | `backend/server.py` is the entry point |
| Database driver | Motor (async MongoDB) | |
| Passwords | bcrypt | |
| Tokens | PyJWT (HS256), plus RS256 checks for Apple | |
| Email | Python `smtplib` (Gmail) or the Resend HTTP API | `backend/email_otp.py` |
| OCR | Veryfi API or local Tesseract | `backend/server.py` |
| Image checks | Pillow | Confirms uploads are real images |
| Dataset import | PyArrow | Reads the Parquet file |
| Address search | Photon (komoot) on OpenStreetMap data | Called directly from the app |
| Chatbot wording | OpenRouter (optional, OpenAI-compatible client) | Only rephrases retrieved text |

## 3. Customer accounts and email verification

**What it does.** Customers sign up with name, email, optional phone and password, then confirm their email with a 6-digit code before they can use the app.

**Where.**
- Backend: `POST /api/auth/register`, `/auth/login`, `/auth/verify-email`, `/auth/resend-code`, `GET /api/me`, `POST /auth/logout` in `backend/server.py`
- Email codes: `backend/email_otp.py`
- App screen: `AuthScreen` in `frontend/app/index.tsx`
- Token storage: `frontend/src/utils/storage/` (`expo-secure-store` on phones, browser storage on web)

**How it works.**
1. **Register.** The server bcrypt-hashes the password and saves the user with `email_verified: false`. It then emails a code and returns `verification_required` instead of a token.
2. **Code.** `email_otp.py` generates a random 6-digit code and stores only an HMAC hash of it in the `email_otps` collection (keyed with `EMAIL_OTP_PEPPER`).
   - The code expires after 10 minutes.
   - Five wrong attempts lock it.
   - A new code can be requested only after 45 seconds.
   - Expired codes are deleted automatically by a MongoDB TTL index.
3. **Verify.** On a correct code the user is marked verified and receives a 14-day JWT. The app stores it securely and signs in automatically on the next launch.
4. **Login before verifying.** Logging in with an unverified account re-sends a code and opens the code screen again.
5. **Email delivery.** Codes go out through Gmail SMTP (needs a Google App Password) or Resend. `EMAIL_PROVIDER` picks one; otherwise Resend is used if configured, then SMTP.
6. **Older accounts.** Accounts created before email verification existed have no `email_verified` field and are treated as verified.

Phone numbers are contact details only. SMS codes are not implemented.

## 4. Google and Apple sign-in

**Where.** `POST /api/auth/session` (Google), `POST /api/auth/apple`. On the app side, `frontend/src/auth-helpers.ts`.

**How it works.**
- **Google** uses Emergent's hosted sign-in. The app opens the hosted page; the backend exchanges the returned `session_id` for a 7-day session stored in `user_sessions`.
- **Apple** sends Apple's identity token to the backend. The backend checks the signature against Apple's public keys (cached for an hour), the audience (`APPLE_AUDIENCES`) and the issuer.
  - An existing account is linked only through the email Apple itself signs, never one the app sends. This prevents account takeover.
- Both providers verify the email themselves, so these accounts are marked `email_verified: true`.
- A single `current_user` dependency accepts both the app's JWTs and Google session tokens.

## 5. Medicine catalog (Indian medicines dataset)

**What it does.** The catalog holds 11,501 real Indian medicines from the Hugging Face dataset [`dmedhi/indian-medicines`](https://huggingface.co/datasets/dmedhi/indian-medicines). Each has a name, composition, uses, side effects and a pack photo.

**Where.**
- Data file: `docs/train-00000-of-00001.parquet`
- Importer: `backend/catalog_import.py`
- Manual re-import: `backend/scripts/import_medicine_dataset.py`
- Startup hook: `seed_database()` in `backend/server.py` calls `ensure_dataset_imported()`

**How it works.**
1. **Read.** PyArrow reads the 11,825 rows, and duplicates are removed: each medicine gets a stable id made from a SHA-1 of its name and composition (`med-xxxxxxxxxxxx`).
2. **Uses and side effects.** The dataset runs phrases together ("…refluxTreatment of…"), so `split_uses()` and `split_side_effects()` split them into clean lists.
3. **Form.** `infer_form()` reads the dosage form (Tablet, Syrup, Cream, Injection and so on) from the name.
4. **Category.** `infer_category()` gives one of 15 categories (Heart & Blood Pressure, Infections, Diabetes Care and so on). It matches keyword rules against the *first* listed use, then the full text.
5. **Prescription flag.** `infer_prescription_required()` is deliberately cautious:
   - A medicine is marked "prescription likely" unless every ingredient is on a short list of common over-the-counter ones (paracetamol, cetirizine, vitamins and so on).
   - Injections and vaccines are always marked as needing a prescription.
   - The flag is stored with `prescription_flag_source: "inferred"`, and the app says it is an estimate.
6. **Upsert.** Documents are upserted in batches of 1,000.
7. **Old demo data.** The hand-written demo medicines, and any carry-list rows pointing to them, are moved to `medicines_demo_backup` and `pharmacy_carry_list_demo_backup`, not deleted.
8. **Categories.** The `categories` collection is rebuilt with real counts.
9. **Indexes.** The importer creates indexes on `id`, `name_lower` and `category`, plus a text index on name and composition.

The dataset has **no prices or manufacturers**. Each pharmacy sets its own price on its carry list, and the app shows "Price set by pharmacy" or "In offers".

## 6. Search and categories

**Where.**
- `GET /api/medicines?search=&category=&limit=&skip=` and `GET /api/medicines/{id}` in `backend/server.py` (`search_medicines()`)
- App: Home and Shop screens in `frontend/app/index.tsx`

**How it works.**
- **Ranking.** Names that *start with* the search come first (`name_lower` prefix regex), then other matches.
- **Several words.** Each word must appear in the name or the composition, in any order: "paracetamol 650" finds Albimol 650mg.
- **On the server.** Search runs on the server because the catalog is too large to send to the phone. The app waits 300 ms after typing stops, then re-queries; category chips filter the same way.
- **No match.** If nothing matches, the app offers to send a request by name to nearby pharmacies.

The dataset uses Indian spellings (for example "Amoxycillin"). Some popular brands are not in it.

## 7. Delivery location and address search

**What it does.** Customers choose where medicines should be delivered. Routing needs real coordinates.

**Where.**
- `frontend/src/components/location-modal.tsx`
- `frontend/src/geocoding.ts` (Photon)
- `frontend/src/components/map-location-picker.tsx` (phones) and `.web.tsx` (web)

**How it works.**
- There are three ways to set a location:
  - **Current location** (`expo-location` with reverse geocoding).
  - **Search:** as you type, Photon returns OpenStreetMap places near the current pin.
  - **Map:** tap to drop a pin; Photon or the device geocoder looks up its address.
- **Coordinates required.** A location can only be saved once it has coordinates. Typed text can refine the address (flat, building) but cannot replace the pin.
- **Recent places.** The current location and the last 6 places are kept on the device.
- **Fallback.** When a request is sent, the app uses the saved coordinates. If there are none, it geocodes the address (device geocoder first, then Photon).

Photon is a public demo service; check its limits before heavy production use.

## 8. Prescription upload and OCR

**What it does.** Customers upload a photo of a prescription. Medicine names are read automatically as a suggestion, and a pharmacist always reviews the actual image.

**Where.**
- Backend: `POST /api/prescriptions` (upload), `POST /api/prescriptions/{id}/analyze` (OCR), `GET /api/prescriptions/ocr-config`, and `extract_medicines()` in `backend/server.py`
- App: `UploadModal` in `frontend/app/index.tsx`

**How it works.**
1. **Upload checks.** The server reads at most 8 MB and identifies the file from its bytes (not the claimed type). It accepts only JPEG, PNG or WebP that Pillow can open; anything else gets HTTP 415. The image is stored in the `prescriptions` collection.
2. **OCR provider.** `OCR_PROVIDER` selects `none`, `tesseract` or `veryfi`. If it isn't set, Veryfi is used when its keys exist, otherwise Tesseract if installed.
3. **Veryfi consent.** Veryfi is an outside service, so the app shows a separate checkbox. Without consent the server falls back to local Tesseract.
4. **Never blocks.** If OCR is off or fails, the response says so and the customer can still send the prescription.
5. **Parsing.** `extract_medicines()` reads lines starting with Tab/Cap/Syp/Inj and so on. It cuts dosing text ("1-0-1", "x 5 days", "after food") out of the name and keeps strength, frequency and duration as separate fields.
6. **Review.** The customer unticks anything wrong. They must also tick a separate consent box to share the prescription with matched pharmacies; the backend rejects requests without it.
7. **Into the request.** Ticked medicines become typed-name lines in the request.

OCR confidence is only about reading text. It never verifies that a prescription is genuine.

## 9. Medicine requests and pharmacy matching

**What it does.** A request (catalog items, typed names and/or a prescription) is sent to the best nearby pharmacies. Adding to the cart never creates an order.

**Where.** `POST/GET /api/medicine-requests`, `GET/DELETE /api/medicine-requests/{id}` in `backend/pharmacy_routes.py`.

**How it works.**
1. **Validation.** Every line must be a catalog item or a typed name, with no duplicates. A family profile must belong to the customer. Prescription-required items need a prescription, and a prescription needs sharing consent.
2. **Eligible pharmacies** must:
   - be **verified**;
   - be **accepting requests**;
   - have **map coordinates**;
   - have a **carry list that includes at least one requested catalog item**, for requests that contain catalog items. Typed-name and prescription-only requests skip this check.
3. **Distance.** The haversine formula gives the distance to each eligible pharmacy, and the **5 nearest** get an assignment.
4. **Status.** The request becomes `collecting_offers` and expires after 30 minutes. If nobody matched, it is `no_pharmacies`.
5. **Privacy.** Pharmacies never see the customer's address, coordinates or user id while the request is open.
6. **Withdraw.** The customer can withdraw a request, which closes its assignments and open offers.

## 10. Pharmacist review and offers

**Where.**
- `/api/pharmacist/requests`, `/requests/{id}/prescription`, `/prescription-review` and `/offer` in `backend/pharmacy_routes.py`
- Website: `RequestsPage` in `pharmacist-web/src/App.tsx`

**How it works.**
- **Queue.** Pharmacists see only their own pharmacy's assigned requests, and the queue refreshes every 10 seconds.
- **Opening a prescription** works only for an assigned request with customer consent. Every view is written to `prescription_access_log`.
- **Review decision.** The pharmacist records **matches**, **clarification needed** or **not approved**. An offer on a prescription request needs a "matches" decision.
- **Building an offer:**
  - Catalog lines must be on the pharmacy's carry list, and the carry-list price is used.
  - Quantities must match the request.
  - A "full" offer must cover every requested item.
- **Prescription-only requests.** After a "matches" review, the pharmacist can add catalog products or **custom medicines with a price**. These additions are kept locally so the 10-second refresh doesn't wipe them.
- **Limits.** Each pharmacy can respond once per request. Offers expire after 15 minutes or when the request expires, whichever is first.
- **Delivery fee.** Free above ₹299, otherwise ₹29.
- **Carry list.** Pharmacists choose which medicines they carry and set prices (`/pharmacist/catalog`, `/pharmacist/carry-list`). If a catalog medicine has an MRP, the pharmacy price can't exceed it. The carry list only routes requests; it is not stock.

## 11. Choosing an offer and orders

**Where.**
- `POST /api/medicine-requests/{id}/select-offer`, `GET /api/orders`, `GET /api/pharmacist/orders` and `PATCH /api/pharmacist/orders/{id}/status`
- App screens: Requests and Orders

**How it works.**
1. **Choosing.** The customer picks an eligible, unexpired offer. The server claims the request atomically (status `selecting_offer`), so two offers can't both become orders.
2. **Order created.** The order copies the offer's prices. Its status starts at **Pharmacy Confirmed**, and other pharmacies' assignments are closed.
3. **Status updates.** The pharmacist moves the order through **Preparing → Out for Delivery → Delivered**; invalid jumps are rejected.
4. **Customer view.** The customer sees the status and a timeline. The Requests screen refreshes every 6 seconds while open.
5. **Direct orders are disabled:** `POST /api/orders` returns 409.

## 12. Refill reminders

**Where.** `GET /api/refills` and `POST /api/refills/{id}/reorder` (disabled, returns 409); the reminder card on Home.

**How it works.** When an order containing a prescription medicine is created, a refill entry is added, due 30 days later. Home shows the next one. Tapping "Refill" puts the medicine back in the cart and asks for a fresh prescription, which creates a new request; it never re-orders directly.

## 13. Family profiles

**Where.** `GET/POST /api/family` and `DELETE /api/family/{id}`; `frontend/src/components/family-modal.tsx`.

**How it works.** Profiles (relation, age, allergies) are stored on the user document. Picking an active profile tags new requests and orders with that person's name, shown as "Ordering for …" on Home.

## 14. Medicine chatbot ("Ask")

**Where.** `POST /api/chat` → `backend/rag/pipeline.py`; `MedicineChatScreen` in the app.

**How it works.**
- **Safety checks first.**
  - **Emergency phrases** get an instruction to call 112 or emergency services.
  - **Personal medical questions** ("should I take…") are declined.
  - **Price and stock questions** are pointed to the order screens.
- **Retrieval.** The question is matched against pharmacist-reviewed documents (`medicine_knowledge`, `review_status: approved`) and against **catalog entries found with MongoDB text search**, using TF-IDF-style ranking.
- **Clinical questions** (uses, dose, side effects) need pharmacist-reviewed content. Catalog data alone is not enough, so without reviewed content the bot says it doesn't have verified information.
- **Optional wording.** If `OPENROUTER_API_KEY` is set, OpenRouter (default `openai/gpt-4o-mini`) rephrases *only the retrieved text*; catalog-only answers skip it.
- **Logging.** Every question and answer is written to an audit collection.

## 15. Payments (Razorpay)

**Where.** `/api/payments/razorpay/config`, `/order`, `/verify` and `/webhook` in `backend/server.py`.

**How it works.** Online payment stays off while the keys are `placeholder`; cash on delivery is the default.
- **Create.** With real keys, the server creates a Razorpay order for the order total.
- **Verify.** It checks the payment signature (HMAC-SHA256) and marks the order paid.
- **Webhook.** Razorpay's webhook is checked against `RAZORPAY_WEBHOOK_SECRET`.
- **Phones.** Native payments need a development build with `react-native-razorpay`; they don't work in Expo Go.

## 16. Pharmacist website

**Where.** `pharmacist-web/src/App.tsx` (workspace), `AuthDialog.tsx` (sign-in, registration and verification), `api.ts` (API client), `styles.css` (theme).

**How it works.**
- **Signed out.** A full-page sign-in screen is shown, with a brand panel and the sign-in, register or verify-email form; no workspace is visible.
- **Signed in.** Pharmacist JWTs last 12 hours. Each one is tied to a session in `pharmacist_sessions`, so signing out or being suspended ends it immediately.
- **Pages:**
  - **Requests:** queue, prescription review, offer builder and availability toggle.
  - **Medicines we carry:** server-side search across the whole catalog, pack images, prices and carry toggles. A price is required before an item can be carried.
  - **Orders:** status updates.
- **Look.** Same palette as the app (deep teal, mint background, lime accent), pill-shaped controls and rounded cards.

## 17. Pharmacy registration and verification

**Where.** `/api/pharmacist/auth/register`, `/verify-email`, `/resend-code` and `/login` in `backend/pharmacy_routes.py`; admin approval is in section 18.

**How it works.**
1. **Register.** The pharmacist enters their details, licence number, address and a map pin. Both the pharmacy and the account start as **pending**, and a verification code is emailed.
2. **Verify email.** The pharmacist enters the code ("Verify your email" on the sign-in page).
3. **Approve.** An admin approves the pharmacy; approval is blocked until the email is verified. The pharmacy becomes verified and accepting requests.
4. **Sign-in messages** are clear for each state: email not verified, awaiting approval, rejected or suspended.

## 18. Admin console and performance metrics

**What it does.** A live dashboard for running the network, at `/admin` on the pharmacist website.

**Where.**
- Backend: `backend/admin_routes.py`
  - `GET /api/admin/metrics?days=`
  - `GET /api/admin/pharmacies`
  - `POST /api/admin/pharmacies/{id}/reject`, `/suspend` and `/reinstate`
  - The older `/admin/pharmacies/pending` and `/verify` routes are in `pharmacy_routes.py`
- Website: `pharmacist-web/src/AdminPanel.tsx` and `Charts.tsx`

**Access.** Admin routes need the `X-Pharmacy-Admin-Token` header to match `PHARMACY_ADMIN_TOKEN` (loaded from `backend/_admin.env`), compared in constant time. The console keeps the token for the current browser tab only.

**Tabs.**
- **Overview:**
  - Headline numbers: customers, active this week, requests, request-to-order conversion, order value, and median time to first offer.
  - A requests-vs-orders trend for 7, 14 or 30 days.
  - The conversion funnel, request outcomes, most-requested medicines, offer outcomes, top pharmacies with win rate, the pharmacy network and sign-in methods.
- **Applications:** pending pharmacies with a map, licence and contact details. Approve or reject with an inline confirmation; rejecting records a reason.
- **Pharmacies:** a searchable, filterable directory with activity counts. Suspend (with a reason; signs pharmacists out immediately) or reinstate.
- **System health:**
  - Response times (p50, p95, p99), server and client error rates, and database ping.
  - p95 latency by hour, and the busiest endpoints.
  - Integration status: email, OCR, catalog and accounts.

**How the metrics work.**
- **Business numbers** are calculated on each call from the database collections. Only totals are returned, never customer names, emails or addresses.
- **API performance** comes from a FastAPI middleware (`RequestStats` in `admin_routes.py`). It records each API call's route template, status and duration in memory (the latest 20,000 calls; admin calls excluded). Percentiles cover the last 24 hours, and **the numbers reset when the backend restarts**.
- **Live updates.** The console refreshes every 30 seconds while "Live" is on.

**Charts.** Plain SVG in `Charts.tsx`:
- A two-series line chart with a hover crosshair, tooltip, keyboard arrows, direct labels and a "View as table" option.
- Horizontal bar lists.
- An hourly column chart.
- Colours are teal for requests and orange for orders; this pair passed colour-blindness and contrast checks.

## 19. Mobile app design system and animations

**Where.**
- Theme tokens: `frontend/src/theme.ts`
- Shared styles and screens: `frontend/app/index.tsx`
- Logo: `frontend/src/components/capsule-pill.tsx`
- Pop-up messages: `frontend/src/alert.ts`

**How it works.**
- **Tokens.** Every colour is a named token: mint-grey canvas `#F2F6F5`, white cards, deep teal `#0E8F7E` / `#0A5F55`, lime accent `#E3F98E`. Shadows are tokens too. Screens build styles with `makeStyles()`, so no colours are hard-coded in components.
- **Screens:**
  - **Home:** logo, greeting and location; a big headline and search; a teal hero card; an active-request card; a refill reminder; quick actions; category chips; pharmacy cards; and a two-column medicine grid.
  - **Medicine details:** a large image, stat tiles, uses, side-effect chips and a sticky add-to-cart bar.
- **Animations** use Reanimated and run on the UI thread:
  - The floating tab bar's white pill springs between tabs.
  - Icons cross-fade from outline to filled, and labels fade in.
  - Tabs shrink slightly when pressed.
  - Each tab switch fades and slides the content in.
- **Web pop-ups.** React Native's `Alert` does nothing on web, so `showAlert()` falls back to browser dialogs there.

## 20. Configuration reference

Secrets live in git-ignored files: `backend/.env`, `backend/_admin.env` and `frontend/.env`.

| Variable | File | Purpose |
|---|---|---|
| `MONGO_URL`, `DB_NAME` | backend/.env | Database |
| `JWT_SECRET` | backend/.env | Signs customer and pharmacist tokens |
| `PHARMACY_ADMIN_TOKEN` | backend/_admin.env | Admin console and admin API |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_STARTTLS`, `SMTP_USE_SSL` | backend/.env | Gmail or other SMTP for codes (Gmail needs an App Password) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `EMAIL_PROVIDER` | backend/.env | Resend alternative, and forcing a provider |
| `EMAIL_OTP_PEPPER` | backend/.env | Secret used to hash codes |
| `EMAIL_OTP_DEV_MODE` | backend/.env | Returns codes in API responses. **Local testing only** |
| `OCR_PROVIDER`, `VERYFI_CLIENT_ID`, `VERYFI_USERNAME`, `VERYFI_API_KEY` | backend/.env | OCR |
| `APPLE_AUDIENCES` | backend/.env | Apple sign-in bundle ids |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | backend/.env | Payments |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | backend/.env | Optional chatbot wording |
| `EXPO_PUBLIC_BACKEND_URL` | frontend/.env | API address for the app. Use the computer's network IP when testing on a phone |
| `VITE_API_URL` | pharmacist-web/.env.local | API address for the website (default `http://127.0.0.1:8001/api`) |

## 21. Scripts and testing

| Command (from `backend/`) | What it does |
|---|---|
| `.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001 --reload` | Runs the API |
| `.venv/bin/python scripts/check_email.py you@example.com` | Shows the email provider and sends a test email |
| `.venv/bin/python scripts/import_medicine_dataset.py` | Re-imports the medicine dataset |
| `PYTHONPATH=.. .venv/bin/pytest -q tests/test_rag_pipeline.py` | Offline chatbot tests |

- **Customer app:** `cd frontend && yarn expo start -c`
- **Pharmacist website:** `cd pharmacist-web && npm run dev`, then open http://localhost:5174 (admin at `/admin`)
- **Checks used during development:**
  - An end-to-end script against an isolated test database covering every feature above (87 checks).
  - TypeScript and ESLint for the app, and a production build for the website.

## 22. Known limitations

- **Catalog data.** The catalog is a public dataset: not pharmacist-reviewed, no prices, and the prescription flag is estimated.
- **Stock.** There is no live stock or reservation. Pharmacists confirm shelf stock for each request.
- **Prescription storage.** Prescriptions are stored as base64 in MongoDB. Production should use private, encrypted object storage with retention rules.
- **Phone numbers** are not verified (no SMS codes).
- **Metrics history.** API metrics live in memory and reset when the backend restarts. Long-term history needs an external monitoring tool.
- **Notifications.** There are no push notifications or background jobs; the apps poll for updates.
- **Logout.** Signing out of the customer app does not revoke JWTs early; they expire after 14 days.
- **Readiness.** This is a prototype. Technical safeguards are not legal, regulatory or clinical approval. Use synthetic data until the privacy and security review is done.
