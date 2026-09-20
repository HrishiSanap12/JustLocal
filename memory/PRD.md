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

### Cart & Checkout (Modal)
Line items with +/– quantity, subtotal + delivery fee (free above ₹299, else ₹29), checkout page with delivery address, fulfilling pharmacy, **payment method selector**:
- **Cash on delivery** — default
- **Pay online (Razorpay)** — reads `/api/payments/razorpay/config`; auto-disabled when keys are placeholders. On web, injects `checkout.razorpay.com/v1/checkout.js` and runs `window.Razorpay`. On native, notifies that a dev build is required and falls back to COD.

### Prescription Upload
`expo-image-picker` gallery selection → multipart upload to `/api/prescriptions`.

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
- **Frontend**: Expo (React Native) + Expo Router. Screens in `/app/frontend/app/index.tsx`. Design tokens in `/app/frontend/src/theme.ts`. API client in `/app/frontend/src/api.ts`. Auth helpers in `/app/frontend/src/auth-helpers.ts`. Logo in `/app/frontend/src/components/capsule-pill.tsx`. Local storage via `@/src/utils/storage`.
- **Backend**: FastAPI (`/app/backend/server.py`), routes prefixed `/api`, JWT (HS256) + Emergent session tokens, MongoDB via `motor`. Seeds catalog + demo user on startup.
- **Database**: MongoDB (`DB_NAME=justlocal`). Collections: `users`, `user_sessions`, `categories`, `medicines`, `pharmacies`, `offers`, `orders`, `prescriptions`. Indexes: `users.apple_sub` (sparse unique), `user_sessions.session_token` (unique), TTL on `user_sessions.expires_at`.

## 5. Key API Endpoints
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/apple`, `POST /api/auth/session`, `POST /api/auth/logout`
- `GET /api/me`
- `GET /api/categories`, `GET /api/medicines?category=&search=`
- `GET /api/pharmacies`, `GET /api/offers`
- `GET /api/orders`, `POST /api/orders`
- `POST /api/prescriptions` (multipart)
- `POST /api/addresses`
- `GET /api/payments/razorpay/config`, `POST /api/payments/razorpay/order`, `POST /api/payments/razorpay/verify`, `POST /api/payments/razorpay/webhook`

## 6. Environment Variables (backend)
- `MONGO_URL`, `DB_NAME`, `JWT_SECRET`
- `APPLE_AUDIENCES` — comma-separated. Currently `com.emergent.mobilerelease.hn2kmj,host.exp.Exponent`
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` — placeholders; add real Test-mode keys to enable online payments

## 7. Backlog
- Emergent push notifications (skipped this session; needs `google-services.json`)
- Real Razorpay keys → live Test-mode payment
- `react-native-razorpay` for native dev builds (currently web-only)
- Multiple pharmacies at checkout
- Real-time order status
- Voice search
- Family profiles & auto-refill subscriptions

## 8. Non-goals (MVP)
Web version, in-app pharmacist chat, complex loyalty program.

## 9. Test Credentials
See `/app/memory/test_credentials.md`.
