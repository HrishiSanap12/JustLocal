# Justlocal — Product Requirements Document

## 1. Problem Statement
Build **Justlocal**, a local-first mobile app that lets users discover, browse, and order medicines from nearby pharmacies. Upload prescriptions, track orders, use location to find pharmacies, pay via Razorpay, sign in with Google / Apple / email.

## 2. Personas
- **Everyday buyer** — orders OTC medicines, vitamins, healthcare essentials
- **Prescription patient** — uploads prescription for pharmacist review
- **Household caregiver** — recurring orders with saved addresses

## 3. MVP Scope (Implemented)

### Authentication
- **Email/phone + password** (JWT, 14-day tokens, bcrypt) — `/api/auth/register`, `/api/auth/login`
- **Sign in with Apple** — `expo-apple-authentication` on iOS; backend verifies identity token against Apple JWKS at `/api/auth/apple`; iOS-only (button auto-disabled on Android/web)
- **Sign in with Google (Emergent-managed)** — hosted OAuth flow. Frontend opens `https://auth.emergentagent.com/?redirect=...`, captures `session_id` from hash fragment, POSTs to `/api/auth/session`, which exchanges it with `demobackend.emergentagent.com` and returns a 7-day session token stored in `expo-secure-store`
- Sessions unified: `current_user` dependency accepts both JWT and Emergent session tokens
- Auto-login via `secureGet('justlocal_token')` + `/api/me` on launch
- Logout — `POST /api/auth/logout` + secure-store clear

### Home
Location banner, search, hero CTA, prescription upload card, quick actions, promo strip, shop-by-category rail, nearby pharmacies rail, popular products.

### Categories
Search, wellness hero, 12-tile category grid, popular products.

### Product Details (Modal)
Icon, name/pack/manufacturer/price, Rx warning, composition, local availability, Add to cart.

### Medicine Requests and Offers
The cart submits a medicine request rather than choosing a hard-coded pharmacy. The backend matches up to five nearest verified pharmacies that carry all requested catalog medicines. The customer sees live responses and chooses one offer; only that choice creates an order. Current customer order payment is Cash on Delivery.

### Prescription Upload
`expo-image-picker` gallery selection → multipart upload to `/api/prescriptions`. Customer must explicitly consent before the uploaded file is shared with pharmacies matched to the request. Prescription-only requests are supported. Pharmacists manually record whether the prescription matches, needs clarification, or cannot be approved; the app does not interpret prescriptions.

### Pharmacist Website
`pharmacist-web/` is a responsive website for request review, medicine carry-list and price management, prescription review, and orders. Carry lists have no stock quantity. Registration remains pending until manual verification. The website offers a labeled sample preview when not signed in.

### Orders
Tabs (All/Ongoing/Delivered/Cancelled), order cards, tracking timeline modal (5 steps).

### Offers
Three seeded promo cards.

### Account
Profile card, rows for Orders/Addresses/Payment/Prescriptions/Help/About, address add modal, logout.

### Location
`expo-location.requestForegroundPermissionsAsync` on first authenticated load. Optional (app works if denied).

### UI polish (this session)
- **Playful mint AuthScreen** — soft `brandTertiary → surface` gradient hero, "MEDICINES CLOSER TO YOU" pill tag
- **CapsulePill logo mark** — two rotated halves (teal + mint) with white cross badge; used on splash, auth screen, and home header
- Card-style form with segmented Log in / Sign up switch, icon-decorated inputs, larger primary CTA, side-by-side Google + Apple buttons

## 4. Architecture
- **Customer frontend**: Expo (React Native) + Expo Router in `frontend/`. The customer API client and shared types are in `frontend/src/api.ts`.
- **Pharmacist frontend**: responsive React/Vite website in `pharmacist-web/`, connected to the shared API after pharmacist sign-in.
- **Backend**: one FastAPI service. `backend/server.py` remains the app entry point; `backend/pharmacy_routes.py` implements pharmacy-scoped auth, carry lists, requests, offers, prescription review, and pharmacy orders.
- **Database**: MongoDB (`DB_NAME=justlocal`). Existing collections include `users`, `user_sessions`, `categories`, `medicines`, `pharmacies`, `orders`, and `prescriptions`; pharmacy flow adds `pharmacist_accounts`, `pharmacist_sessions`, `pharmacy_carry_list`, `medicine_requests`, `pharmacy_request_assignments`, `pharmacy_offers`, and `prescription_reviews`.

## 5. Key API Endpoints
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/apple`, `POST /api/auth/session`, `POST /api/auth/logout`
- `GET /api/me`
- `GET /api/categories`, `GET /api/medicines?category=&search=`
- `GET /api/pharmacies`, `GET /api/offers`
- `POST /api/medicine-requests`, `GET /api/medicine-requests`, `GET /api/medicine-requests/{id}`, `POST /api/medicine-requests/{id}/select-offer`
- Pharmacist routes: `/api/pharmacist/auth/*`, `/api/pharmacist/requests`, `/api/pharmacist/carry-list`, `/api/pharmacist/orders`
- `GET /api/orders`; direct `POST /api/orders` now returns 409 to prevent bypassing offer selection
- `POST /api/prescriptions` (multipart)
- `POST /api/addresses`
- `GET /api/payments/razorpay/config`, `POST /api/payments/razorpay/order`, `POST /api/payments/razorpay/verify`, `POST /api/payments/razorpay/webhook`

## 6. Environment Variables (backend)
- `MONGO_URL`, `DB_NAME`, `JWT_SECRET`
- `PHARMACY_ADMIN_TOKEN` — server-only credential for initial manual pharmacy verification endpoints; use role-based admin accounts before production
- `APPLE_AUDIENCES` — comma-separated. Currently `com.emergent.mobilerelease.hn2kmj,host.exp.Exponent`
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` — placeholders; add real Test-mode keys to enable online payments

## 7. Backlog
- Replace development medicine fixtures with an authoritative India catalog source; current seeded medicines are not represented as government-approved
- Move prescription files from MongoDB base64 documents to private object storage with retention/access controls
- Add an admin portal and replace the shared pharmacy admin token
- Add a durable worker/outbox and push notifications (customer currently polls for offers)
- Add Razorpay checkout after offer selection
- Make pharmacist request and prescription states fully real-time
- Voice search
- Family profiles & auto-refill subscriptions

## 8. Non-goals (MVP)
In-app pharmacist chat, complex loyalty program.

## 9. Test Credentials
See `/app/memory/test_credentials.md`.
