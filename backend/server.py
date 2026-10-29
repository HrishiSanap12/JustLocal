from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional
from math import atan2, cos, radians, sin, sqrt
import base64
import hashlib
import hmac
import json
import logging
import os
import re
import uuid
import asyncio
import io
import shutil
import bcrypt
import httpx
import jwt
import razorpay
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from admin_routes import RequestStats, build_admin_router
from catalog_import import ensure_dataset_imported
from email_otp import check_code, send_code
from pharmacy_routes import build_pharmacy_router
from rag.pipeline import answer_medicine_question


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
load_dotenv(ROOT_DIR / ".admin.env")
load_dotenv(ROOT_DIR / "_admin.env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get("DB_NAME", "justlocal")]
JWT_SECRET = os.environ.get("JWT_SECRET", "justlocal-development-secret")
JWT_ALGORITHM = "HS256"
APPLE_AUDIENCES = [a.strip() for a in os.environ.get("APPLE_AUDIENCES", "").split(",") if a.strip()]
APPLE_ISSUER = "https://appleid.apple.com"
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "placeholder")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "placeholder")
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "placeholder")
_razorpay_ready = RAZORPAY_KEY_ID != "placeholder" and RAZORPAY_KEY_SECRET != "placeholder"
rzp_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)) if _razorpay_ready else None

app = FastAPI(title="Justlocal API")
api_router = APIRouter(prefix="/api")
request_stats = RequestStats()
app.middleware("http")(request_stats.middleware)


class AuthInput(BaseModel):
    identifier: str
    password: str


class MedicineChatInput(BaseModel):
    question: str = Field(min_length=2, max_length=500)


class RegisterInput(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    password: str


class VerifyEmailInput(BaseModel):
    email: str
    code: str = Field(min_length=4, max_length=10)


class ResendCodeInput(BaseModel):
    email: str


class AnalyzePrescriptionInput(BaseModel):
    external_ocr_consent: bool = False


class AppleSignInInput(BaseModel):
    identity_token: str
    name: Optional[str] = None
    email: Optional[str] = None


class SessionExchangeInput(BaseModel):
    session_id: str


class OrderItem(BaseModel):
    medicine_id: str
    name: str
    quantity: int = Field(ge=1)
    price: float = Field(ge=0)


class OrderCreate(BaseModel):
    pharmacy_id: str
    items: List[OrderItem]
    address: str
    delivery_method: str = "delivery"
    subtotal: float = Field(ge=0)
    discount: float = Field(default=0, ge=0)
    delivery_fee: float = Field(default=0, ge=0)
    total: float = Field(ge=0)
    for_profile_id: Optional[str] = None
    for_profile_name: Optional[str] = None


class AddressInput(BaseModel):
    label: str
    address: str
    phone: Optional[str] = None


class FamilyMemberInput(BaseModel):
    name: str
    relation: str  # self | spouse | parent | child | sibling | other
    age: Optional[int] = Field(default=None, ge=0, le=120)
    allergies: Optional[str] = None


class RefillReorderInput(BaseModel):
    address: Optional[str] = None
    for_profile_id: Optional[str] = None


class RazorpayOrderInput(BaseModel):
    order_id: str


class RazorpayVerifyInput(BaseModel):
    order_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_user(document: dict) -> dict:
    return {
        "id": document["id"],
        "name": document.get("name", "Justlocal member"),
        "email": document.get("email", ""),
        "email_verified": document.get("email_verified", True),
        "phone": document.get("phone"),
        "addresses": document.get("addresses", []),
        "family_members": document.get("family_members", []),
    }


def create_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=14)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Please sign in to continue")
    token = authorization.split(" ", 1)[1]
    # First try local JWT
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if user:
            return user
    except jwt.PyJWTError:
        pass
    # Fallback: Emergent-managed session token
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if session:
        expires_at = session.get("expires_at")
        if isinstance(expires_at, datetime):
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at > datetime.now(timezone.utc):
                user = await db.users.find_one({"id": session["user_id"]}, {"_id": 0})
                if user:
                    return user
    raise HTTPException(status_code=401, detail="Your session has expired")


def public_auth(user: dict) -> dict:
    return {"token": create_token(user["id"]), "user": safe_user(user)}


async def seed_database() -> None:
    # The medicine catalog and categories come from the Indian medicines dataset (see catalog_import.py).
    await ensure_dataset_imported(db)

    if await db.pharmacies.count_documents({}) == 0:
        await db.pharmacies.insert_many([
            {"id": "pharmacy-1", "name": "Apollo Pharmacy", "area": "Hiranandani Estate", "distance": "1.2 km", "eta": "10–15 min", "rating": 4.6, "reviews": "1.2k", "threshold": 299, "status": "Open"},
            {"id": "pharmacy-2", "name": "MedPlus", "area": "Thane West", "distance": "2.4 km", "eta": "15–20 min", "rating": 4.4, "reviews": "980", "threshold": 199, "status": "Open"},
            {"id": "pharmacy-3", "name": "Sun Pharma Store", "area": "Kasarvadavali", "distance": "3.1 km", "eta": "20–25 min", "rating": 4.5, "reviews": "640", "threshold": 299, "status": "Open"},
        ])
    await db.pharmacies.update_many(
        {"verification_status": {"$exists": False}},
        {"$set": {"verification_status": "verified", "accepting_requests": False}},
    )

    if await db.offers.count_documents({}) == 0:
        await db.offers.insert_many([
            {"id": "offer-1", "title": "Flat 25% off", "subtitle": "On your first medicine order", "code": "JUST25", "detail": "Up to ₹150 off on orders above ₹499", "accent": "teal"},
            {"id": "offer-2", "title": "Flat 15% off", "subtitle": "On healthcare products", "code": "HEALTH15", "detail": "Valid on wellness and devices", "accent": "blue"},
            {"id": "offer-3", "title": "Free delivery", "subtitle": "On orders above ₹299", "code": "LOCALFREE", "detail": "Available from participating pharmacies", "accent": "green"},
        ])

    demo_email = "demo@justlocal.app"
    demo = await db.users.find_one({"email": demo_email}, {"_id": 0})
    if not demo:
        demo = {
            "id": "user-demo",
            "name": "Hrishikesh Sanap",
            "email": demo_email,
            "phone": "+91 98765 43210",
            "password_hash": bcrypt.hashpw(b"Justlocal123!", bcrypt.gensalt()).decode(),
            "addresses": [{"id": "addr-1", "label": "Home", "address": "Hiranandani Estate, Thane West, Mumbai - 400607", "phone": "+91 98765 43210", "default": True}],
            "created_at": now_iso(),
        }
        await db.users.insert_one(demo)
    else:
        # Keep the existing seeded demo account aligned with its current profile.
        await db.users.update_one({"id": demo["id"]}, {"$set": {"name": "Hrishikesh Sanap"}})
    if await db.orders.count_documents({"user_id": "user-demo"}) == 0:
        await db.orders.insert_one({
            "id": "order-demo-1", "user_id": "user-demo", "order_number": "JL240921873", "pharmacy_id": "pharmacy-1",
            "pharmacy_name": "Apollo Pharmacy", "items": [{"medicine_id": "med-1", "name": "Crocin 500mg", "quantity": 1, "price": 34}],
            "address": "Hiranandani Estate, Thane West, Mumbai - 400607", "delivery_method": "delivery", "subtotal": 342, "discount": 0, "delivery_fee": 0, "total": 342,
            "status": "Delivered", "created_at": "2025-09-20T10:24:00+00:00", "eta": "Delivered", "timeline": ["Order Placed", "Pharmacy Confirmed", "Preparing", "Out for Delivery", "Delivered"],
        })

    # Indexes for auth flows
    await db.email_otps.create_index([("email", 1), ("purpose", 1)], unique=True)
    await db.email_otps.create_index("expires_at", expireAfterSeconds=0)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.users.create_index("apple_sub", unique=True, sparse=True)
    await db.pharmacist_accounts.create_index("email", unique=True)
    await db.pharmacist_sessions.create_index("id", unique=True)
    await db.pharmacist_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.pharmacies.create_index("license_number", unique=True, sparse=True)
    await db.pharmacies.create_index([("geo_location", "2dsphere")])
    await db.pharmacy_carry_list.create_index([("pharmacy_id", 1), ("medicine_id", 1)], unique=True)
    await db.medicine_requests.create_index("id", unique=True)
    await db.medicine_requests.create_index([("user_id", 1), ("created_at", -1)])
    await db.pharmacy_request_assignments.create_index("id", unique=True)
    await db.pharmacy_request_assignments.create_index([("request_id", 1), ("pharmacy_id", 1)], unique=True)
    await db.pharmacy_request_assignments.create_index([("pharmacy_id", 1), ("status", 1)])
    await db.pharmacy_offers.create_index("id", unique=True)
    await db.pharmacy_offers.create_index([("request_id", 1), ("pharmacy_id", 1)], unique=True)
    await db.orders.create_index("offer_id", unique=True, sparse=True)


@app.on_event("startup")
async def startup_event() -> None:
    await seed_database()


@api_router.get("/")
async def root() -> dict:
    return {"message": "Justlocal API is ready"}


# ---------------- Email / phone auth ----------------
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CUSTOMER_OTP_PURPOSE = "customer-email"


def verification_pending(email: str, extra: dict) -> dict:
    return {"verification_required": True, "email": email, **extra}


@api_router.post("/auth/register")
async def register(payload: RegisterInput) -> dict:
    email = payload.email.strip().lower()
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Please enter your name")
    if not EMAIL_PATTERN.match(email):
        raise HTTPException(status_code=400, detail="Please enter a valid email address")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    phone = (payload.phone or "").strip() or None
    password_hash = bcrypt.hashpw(payload.password.encode(), bcrypt.gensalt()).decode()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing and existing.get("email_verified", True):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    if existing:
        # Unverified sign-up retried: refresh details and send a new code.
        await db.users.update_one({"id": existing["id"]}, {"$set": {"name": name, "phone": phone, "password_hash": password_hash}})
    else:
        await db.users.insert_one({
            "id": f"user-{uuid.uuid4().hex[:10]}", "name": name, "email": email, "phone": phone,
            "password_hash": password_hash, "email_verified": False, "addresses": [], "created_at": now_iso(),
        })
    extra = await send_code(db, email, CUSTOMER_OTP_PURPOSE, "account")
    return verification_pending(email, extra)


@api_router.post("/auth/login")
async def login(payload: AuthInput) -> dict:
    identifier = payload.identifier.strip().lower()
    user = await db.users.find_one({"$or": [{"email": identifier}, {"phone": payload.identifier.strip()}]}, {"_id": 0})
    if not user or not user.get("password_hash") or not bcrypt.checkpw(payload.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="We couldn't match those details")
    if not user.get("email_verified", True):
        try:
            extra = await send_code(db, user["email"], CUSTOMER_OTP_PURPOSE, "account")
        except HTTPException as exc:
            if exc.status_code != 429:  # a recent code is still valid
                raise
            extra = {}
        return verification_pending(user["email"], extra)
    return public_auth(user)


@api_router.post("/auth/verify-email")
async def verify_email(payload: VerifyEmailInput) -> dict:
    email = payload.email.strip().lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")
    if user.get("email_verified", True):
        raise HTTPException(status_code=409, detail="This email is already verified. Please log in.")
    await check_code(db, email, CUSTOMER_OTP_PURPOSE, payload.code)
    await db.users.update_one({"id": user["id"]}, {"$set": {"email_verified": True, "email_verified_at": now_iso()}})
    return public_auth({**user, "email_verified": True})


@api_router.post("/auth/resend-code")
async def resend_code(payload: ResendCodeInput) -> dict:
    email = payload.email.strip().lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or user.get("email_verified", True):
        # Same response either way so this can't be used to probe accounts.
        return {"ok": True}
    extra = await send_code(db, email, CUSTOMER_OTP_PURPOSE, "account")
    return {"ok": True, **extra}


# ---------------- Apple Sign-In ----------------
_apple_jwks_cache: dict = {"keys": [], "fetched_at": 0.0}


async def _apple_jwks() -> list:
    now = datetime.now(timezone.utc).timestamp()
    if _apple_jwks_cache["keys"] and now - _apple_jwks_cache["fetched_at"] < 3600:
        return _apple_jwks_cache["keys"]
    async with httpx.AsyncClient(timeout=8.0) as http:
        response = await http.get(APPLE_JWKS_URL)
        response.raise_for_status()
        _apple_jwks_cache["keys"] = response.json().get("keys", [])
        _apple_jwks_cache["fetched_at"] = now
    return _apple_jwks_cache["keys"]


@api_router.post("/auth/apple")
async def apple_signin(payload: AppleSignInInput) -> dict:
    if not APPLE_AUDIENCES:
        raise HTTPException(status_code=500, detail="Apple sign-in is not configured on the server")
    try:
        unverified = jwt.get_unverified_header(payload.identity_token)
        kid = unverified.get("kid")
        keys = await _apple_jwks()
        jwk = next((key for key in keys if key.get("kid") == kid), None)
        if not jwk:
            raise HTTPException(status_code=401, detail="Apple key not found")
        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))
        claims = jwt.decode(
            payload.identity_token,
            public_key,
            algorithms=["RS256"],
            audience=APPLE_AUDIENCES,
            issuer=APPLE_ISSUER,
        )
    except HTTPException:
        raise
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail=f"Apple sign-in failed: {exc}") from exc

    apple_sub = claims["sub"]
    apple_email = claims.get("email")
    user = await db.users.find_one({"apple_sub": apple_sub}, {"_id": 0})
    if not user and apple_email:
        user = await db.users.find_one({"email": apple_email.lower()}, {"_id": 0})
    if not user:
        user = {
            "id": f"user-{uuid.uuid4().hex[:10]}",
            "name": payload.name or "Apple user",
            "email": (payload.email or apple_email or "").lower(),
            "phone": None,
            "apple_sub": apple_sub,
            "email_verified": True,
            "addresses": [],
            "created_at": now_iso(),
        }
        await db.users.insert_one(user)
    else:
        updates: dict = {"apple_sub": apple_sub, "email_verified": True}
        if payload.name and not user.get("name"):
            updates["name"] = payload.name
        if not user.get("email") and (payload.email or apple_email):
            updates["email"] = (payload.email or apple_email or "").lower()
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
        user = {**user, **updates}
    return public_auth(user)


# ---------------- Emergent Google (managed) ----------------
@api_router.post("/auth/session")
async def exchange_emergent_session(payload: SessionExchangeInput) -> dict:
    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            response = await http.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": payload.session_id})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Google sign-in service unavailable") from exc
    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Google sign-in link has expired or was already used")
    data = response.json()
    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=401, detail="Google sign-in did not return an email")
    session_token = data.get("session_token")
    if not session_token:
        raise HTTPException(status_code=502, detail="Malformed Google sign-in response")

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user and not user.get("email_verified", True):
        await db.users.update_one({"id": user["id"]}, {"$set": {"email_verified": True}})
        user["email_verified"] = True
    if not user:
        user = {
            "id": f"user-{uuid.uuid4().hex[:10]}",
            "name": data.get("name") or "Justlocal member",
            "email": email,
            "phone": None,
            "picture": data.get("picture"),
            "email_verified": True,
            "addresses": [],
            "created_at": now_iso(),
        }
        await db.users.insert_one(user)

    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {"session_token": session_token, "user_id": user["id"], "expires_at": expires_at, "created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"session_token": session_token, "user": safe_user(user)}


@api_router.get("/me")
async def me(user: dict = Depends(current_user)) -> dict:
    return safe_user(user)


@api_router.post("/chat")
async def medicine_chat(payload: MedicineChatInput, user: dict = Depends(current_user)) -> dict:
    return await answer_medicine_question(db, payload.question, user["id"])


@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(default=None)) -> dict:
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ---------------- Catalog ----------------
@api_router.get("/categories")
async def categories() -> list:
    return await db.categories.find({}, {"_id": 0}).to_list(100)


MEDICINE_LIST_FIELDS = {"_id": 0, "name_lower": 0, "source_url": 0, "imported_at": 0}


async def search_medicines(search: Optional[str] = None, category: Optional[str] = None, limit: int = 40, skip: int = 0) -> list:
    """Name matches that start with the search term come first, then other name/composition matches."""
    base: dict = {}
    if category and category != "All":
        base["category"] = category
    term = (search or "").strip()
    if not term:
        return await db.medicines.find(base, MEDICINE_LIST_FIELDS).sort("name_lower", 1).skip(skip).limit(limit).to_list(limit)
    escaped = re.escape(term.casefold())
    prefix = await db.medicines.find({**base, "name_lower": {"$regex": f"^{escaped}"}}, MEDICINE_LIST_FIELDS).sort("name_lower", 1).limit(limit + skip).to_list(limit + skip)
    seen = {item["id"] for item in prefix}
    results = list(prefix)
    if len(results) < limit + skip:
        # Every word must appear in the name or the composition, in any order.
        word_filters = [
            {"$or": [{"name_lower": {"$regex": re.escape(word.casefold())}}, {"composition": {"$regex": re.escape(word), "$options": "i"}}]}
            for word in term.split()[:6]
        ]
        contains = await db.medicines.find(
            {**base, "id": {"$nin": list(seen)}, "$and": word_filters},
            MEDICINE_LIST_FIELDS,
        ).sort("name_lower", 1).limit(limit + skip - len(results)).to_list(limit + skip)
        results.extend(contains)
    return results[skip:skip + limit]


@api_router.get("/medicines")
async def medicines(category: Optional[str] = None, search: Optional[str] = None, limit: int = 40, skip: int = 0) -> list:
    return await search_medicines(search, category, max(1, min(limit, 100)), max(0, skip))


@api_router.get("/medicines/{medicine_id}")
async def medicine_detail(medicine_id: str) -> dict:
    medicine = await db.medicines.find_one({"id": medicine_id}, MEDICINE_LIST_FIELDS)
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")
    return medicine


@api_router.get("/pharmacies")
async def pharmacies(latitude: Optional[float] = None, longitude: Optional[float] = None) -> list:
    if (latitude is None) != (longitude is None):
        raise HTTPException(status_code=422, detail="Provide both latitude and longitude")
    records = await db.pharmacies.find({"verification_status": "verified"}, {"_id": 0}).to_list(100)
    if latitude is None or longitude is None:
        return records

    earth_radius_km = 6371.0
    nearby = []
    for pharmacy in records:
        pharmacy_latitude = pharmacy.get("latitude")
        pharmacy_longitude = pharmacy.get("longitude")
        if not isinstance(pharmacy_latitude, (int, float)) or not isinstance(pharmacy_longitude, (int, float)):
            continue
        delta_latitude = radians(pharmacy_latitude - latitude)
        delta_longitude = radians(pharmacy_longitude - longitude)
        value = sin(delta_latitude / 2) ** 2 + cos(radians(latitude)) * cos(radians(pharmacy_latitude)) * sin(delta_longitude / 2) ** 2
        distance_km = 2 * earth_radius_km * atan2(sqrt(value), sqrt(1 - value))
        if distance_km <= 50:
            nearby.append(({**pharmacy, "distance_km": round(distance_km, 2), "distance": f"{distance_km:.1f} km"}, distance_km))
    nearby.sort(key=lambda item: item[1])
    return [pharmacy for pharmacy, _distance in nearby]


@api_router.get("/offers")
async def offers() -> list:
    return await db.offers.find({}, {"_id": 0}).to_list(50)


# ---------------- Orders ----------------
@api_router.get("/orders")
async def orders(user: dict = Depends(current_user)) -> list:
    return await db.orders.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(100)


@api_router.post("/orders")
async def create_order(payload: OrderCreate, user: dict = Depends(current_user)) -> dict:
    raise HTTPException(status_code=409, detail="Direct orders are disabled. Submit a medicine request and choose a pharmacist offer.")


MAX_PRESCRIPTION_BYTES = 8 * 1024 * 1024


def detect_image_type(contents: bytes) -> Optional[str]:
    """Identify JPEG/PNG/WebP from the file bytes (never trust the client's content type)."""
    if contents.startswith(b"\xff\xd8\xff"):
        kind = "image/jpeg"
    elif contents.startswith(b"\x89PNG\r\n\x1a\n"):
        kind = "image/png"
    elif len(contents) > 12 and contents[:4] == b"RIFF" and contents[8:12] == b"WEBP":
        kind = "image/webp"
    else:
        return None
    try:
        from PIL import Image
        with Image.open(io.BytesIO(contents)) as image:
            image.verify()
    except Exception:
        return None
    return kind


@api_router.post("/prescriptions")
async def upload_prescription(file: UploadFile = File(...), user: dict = Depends(current_user)) -> dict:
    contents = await file.read(MAX_PRESCRIPTION_BYTES + 1)
    if len(contents) > MAX_PRESCRIPTION_BYTES:
        raise HTTPException(status_code=413, detail="Please choose an image smaller than 8 MB")
    if not contents:
        raise HTTPException(status_code=400, detail="The selected file is empty")
    content_type = detect_image_type(contents)
    if not content_type:
        raise HTTPException(status_code=415, detail="Please upload a JPEG, PNG or WebP image")
    extension = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[content_type]
    filename = Path(file.filename or "").name or f"prescription.{extension}"
    prescription = {
        "id": f"rx-{uuid.uuid4().hex[:10]}", "user_id": user["id"], "filename": filename[:120],
        "content_type": content_type, "data": base64.b64encode(contents).decode(),
        "status": "Awaiting pharmacist review", "created_at": now_iso(),
    }
    await db.prescriptions.insert_one(prescription)
    return {"id": prescription["id"], "filename": prescription["filename"], "status": prescription["status"]}

def extract_medicines(raw_text: str, structured_medicine=None):
    """
    Extract medicine information from prescription OCR text.

    Returns:
    [
        {
            "name": "...",
            "strength": "...",
            "frequency": "...",
            "dosage": "...",
            "duration": "..."
        }
    ]
    """

    medicines = []

    # ---------------------------------------------------------
    # 1. Use Veryfi structured medicine if available
    # ---------------------------------------------------------
    if structured_medicine:
     if isinstance(structured_medicine, dict):
        structured_medicine = structured_medicine.get("value")

    if isinstance(structured_medicine, str):

        # Veryfi can sometimes return multiple medicines
        # together in one field, e.g. "Dibact DS; Emset"
        medicine_names = re.split(
            r"\s*[;,]\s*|\s+\band\b\s+",
            structured_medicine,
            flags=re.IGNORECASE,
        )

        for medicine_name in medicine_names:
            medicine_name = medicine_name.strip()

            if not medicine_name:
                continue

            medicines.append({
                "name": medicine_name,
                "strength": "",
                "frequency": "",
                "dosage": "",
                "duration": "",
            })

    # ---------------------------------------------------------
    # 2. Process OCR text line by line
    # ---------------------------------------------------------
    lines = [
        line.strip()
        for line in raw_text.splitlines()
        if line.strip()
    ]

    medicine_prefixes = (
        "tab.",
        "tab ",
        "tablet",
        "cap.",
        "cap ",
        "capsule",
        "syp.",
        "syp ",
        "syrup",
        "inj.",
        "inj ",
        "injection",
        "drops",
        "drop.",
    )

    for line in lines:
        lower = line.lower()

        if not lower.startswith(medicine_prefixes):
            continue

        # Remove common prescription prefixes
        cleaned = re.sub(
            r"^(tab\.?|tablet|cap\.?|capsule|syp\.?|syrup|inj\.?|injection|drop\.?|drops)\s*",
            "",
            line,
            flags=re.IGNORECASE,
        ).strip()

        if not cleaned:
            continue

        # -----------------------------------------------------
        # Extract strength
        # Examples:
        # 500 mg
        # 625 mg
        # 40mg
        # 10 ml
        # -----------------------------------------------------
        strength_match = re.search(
            r"\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|%|iu)\b",
            cleaned,
            flags=re.IGNORECASE,
        )

        strength = strength_match.group(0) if strength_match else ""

        # Remove strength from medicine name
        name = cleaned

        if strength:
            name = re.sub(
                re.escape(strength),
                "",
                name,
                flags=re.IGNORECASE,
            )

        # Cut the name before dosing instructions such as "1-0-1", "x 5 days", "after food"
        name = re.split(
            r"\b\d\s*-\s*\d\s*-\s*\d\b|\bx\s*\d+|\bfor\s+\d+|\b\d+\s*(?:day|days|week|weeks|month|months)\b|\b(?:after|before|with)\s+(?:food|meals?)\b",
            name,
            maxsplit=1,
            flags=re.IGNORECASE,
        )[0]

        # Remove bracketed numeric values such as (625)
        name = re.sub(r"\(\s*\d+\s*\)", "", name)

        # Remove obvious dosage/frequency information
        name = re.sub(
            r"\b(?:od|bd|tds|qid|hs|sos|stat|once|twice|thrice)\b",
            "",
            name,
            flags=re.IGNORECASE,
        )

        name = re.sub(
            r"\s+",
            " ",
            name
        ).strip(" -,:;.")

        if len(name) < 2:
            continue

        # -----------------------------------------------------
        # Frequency
        # -----------------------------------------------------
        frequency = ""

        frequency_patterns = [
            (r"\b(?:od|once daily)\b", "Once daily"),
            (r"\b(?:bd|twice daily)\b", "Twice daily"),
            (r"\b(?:tds|three times daily)\b", "Three times daily"),
            (r"\b(?:qid|four times daily)\b", "Four times daily"),
            (r"\b(?:hs|at bedtime)\b", "At bedtime"),
            (r"\b(?:sos|as needed)\b", "As needed"),
        ]

        for pattern, value in frequency_patterns:
            if re.search(pattern, cleaned, re.IGNORECASE):
                frequency = value
                break

        if not frequency:
            schedule = re.search(r"\b\d\s*-\s*\d\s*-\s*\d\b", cleaned)
            if schedule:
                frequency = re.sub(r"\s+", "", schedule.group(0))

        # -----------------------------------------------------
        # Dosage
        # -----------------------------------------------------
        dosage = ""

        dosage_match = re.search(
            r"\b\d+\s*(?:tablet|tablets|tab|capsule|capsules|cap|drop|drops|ml)\b",
            cleaned,
            re.IGNORECASE,
        )

        if dosage_match:
            dosage = dosage_match.group(0)

        # -----------------------------------------------------
        # Duration
        # -----------------------------------------------------
        duration = ""

        duration_match = re.search(
            r"\b\d+\s*(?:day|days|week|weeks|month|months)\b",
            cleaned,
            re.IGNORECASE,
        )

        if duration_match:
            duration = duration_match.group(0)

        medicines.append({
            "name": name,
            "strength": strength,
            "frequency": frequency,
            "dosage": dosage,
            "duration": duration,
        })

    # ---------------------------------------------------------
    # Remove duplicates
    # ---------------------------------------------------------
    unique = {}

    for medicine in medicines:
        key = medicine["name"].lower().strip()

        if key not in unique:
            unique[key] = medicine

    return list(unique.values())
def ocr_provider() -> str:
    """none | tesseract | veryfi. Defaults to Veryfi when its keys exist, else local Tesseract if installed."""
    configured = os.environ.get("OCR_PROVIDER", "").strip().lower()
    if configured in {"none", "tesseract", "veryfi"}:
        return configured
    if all(os.environ.get(key) for key in ("VERYFI_CLIENT_ID", "VERYFI_USERNAME", "VERYFI_API_KEY")):
        return "veryfi"
    return "tesseract" if shutil.which("tesseract") else "none"


async def run_tesseract(image_bytes: bytes) -> Optional[str]:
    binary = shutil.which("tesseract")
    if not binary:
        return None
    try:
        process = await asyncio.create_subprocess_exec(
            binary, "stdin", "stdout",
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(process.communicate(image_bytes), timeout=60)
    except (asyncio.TimeoutError, OSError):
        logger.warning("Tesseract OCR failed or timed out")
        return None
    if process.returncode != 0:
        return None
    return stdout.decode("utf-8", errors="ignore")


async def run_veryfi(prescription: dict, image_bytes: bytes) -> tuple[Optional[str], Optional[str], Optional[dict]]:
    headers = {
        "CLIENT-ID": os.environ.get("VERYFI_CLIENT_ID", ""),
        "Authorization": f"apikey {os.environ.get('VERYFI_USERNAME', '')}:{os.environ.get('VERYFI_API_KEY', '')}",
        "Accept": "application/json",
    }
    files = {"file": (prescription.get("filename", "prescription.jpg"), image_bytes, prescription.get("content_type", "image/jpeg"))}
    try:
        async with httpx.AsyncClient(timeout=60.0) as http:
            response = await http.post(
                "https://api.veryfi.com/api/v8/partner/any-documents",
                headers=headers, files=files, data={"blueprint_name": "prescription_medication_label"},
            )
    except httpx.RequestError as exc:
        logger.warning("Veryfi request failed: %s", exc)
        return None, None, None
    if not response.is_success:
        logger.warning("Veryfi returned HTTP %s", response.status_code)
        return None, None, None
    result = response.json()
    structured = result.get("medicine_name")
    if isinstance(structured, dict):
        structured = structured.get("value")
    return result.get("text", "") or "", structured if isinstance(structured, str) else None, result


@api_router.post("/prescriptions/{prescription_id}/analyze")
async def analyze_prescription(
    prescription_id: str,
    payload: Optional[AnalyzePrescriptionInput] = None,
    user: dict = Depends(current_user),
) -> dict:
    """OCR assists the customer; it never blocks the request. Pharmacists still review the image."""
    prescription = await db.prescriptions.find_one({"id": prescription_id, "user_id": user["id"]}, {"_id": 0})
    if not prescription:
        raise HTTPException(status_code=404, detail="Prescription not found")
    try:
        image_bytes = base64.b64decode(prescription["data"])
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Stored prescription image is invalid") from exc

    consent = bool(payload and payload.external_ocr_consent)
    provider = ocr_provider()
    if provider == "veryfi" and not consent:
        # No consent to send the image externally: fall back to local OCR if we have it.
        provider = "tesseract" if shutil.which("tesseract") else "none"

    ocr_text: Optional[str] = None
    structured: Optional[str] = None
    veryfi_result: Optional[dict] = None
    if provider == "veryfi":
        ocr_text, structured, veryfi_result = await run_veryfi(prescription, image_bytes)
        if ocr_text is None and shutil.which("tesseract"):
            provider = "tesseract"
    if provider == "tesseract" and ocr_text is None:
        ocr_text = await run_tesseract(image_bytes)

    if provider == "none":
        status, message = "unavailable", "Automatic reading is turned off. A pharmacist will read your prescription."
    elif ocr_text is None:
        status, message = "failed", "We couldn't read this image automatically. A pharmacist will read your prescription."
    else:
        status, message = "completed", "Check these suggestions carefully. They are machine-read and may be wrong."

    medicines = extract_medicines(ocr_text or "", structured) if ocr_text is not None else []
    update: dict = {"ocr_provider": provider, "ocr_text": ocr_text or "", "medicines": medicines, "analysis_status": status, "analyzed_at": now_iso()}
    if veryfi_result is not None:
        update["veryfi_analysis"] = veryfi_result
    await db.prescriptions.update_one({"id": prescription_id, "user_id": user["id"]}, {"$set": update})
    return {
        "prescription_id": prescription_id,
        "provider": provider,
        "status": status,
        "message": message,
        "ocr_text": ocr_text or "",
        "medicines": medicines,
    }


@api_router.get("/prescriptions/ocr-config")
async def prescription_ocr_config() -> dict:
    return {"provider": ocr_provider(), "external": ocr_provider() == "veryfi"}


@api_router.post("/addresses")
async def add_address(payload: AddressInput, user: dict = Depends(current_user)) -> dict:
    address = {"id": f"addr-{uuid.uuid4().hex[:8]}", "label": payload.label, "address": payload.address, "phone": payload.phone or user.get("phone"), "default": len(user.get("addresses", [])) == 0}
    await db.users.update_one({"id": user["id"]}, {"$push": {"addresses": address}})
    return address


# ---------------- Family profiles ----------------
@api_router.get("/family")
async def list_family(user: dict = Depends(current_user)) -> list:
    return user.get("family_members", [])


@api_router.post("/family")
async def add_family_member(payload: FamilyMemberInput, user: dict = Depends(current_user)) -> dict:
    member = {
        "id": f"fam-{uuid.uuid4().hex[:8]}",
        "name": payload.name.strip(),
        "relation": payload.relation.strip().lower(),
        "age": payload.age,
        "allergies": payload.allergies,
    }
    await db.users.update_one({"id": user["id"]}, {"$push": {"family_members": member}})
    return member


@api_router.delete("/family/{member_id}")
async def remove_family_member(member_id: str, user: dict = Depends(current_user)) -> dict:
    result = await db.users.update_one({"id": user["id"]}, {"$pull": {"family_members": {"id": member_id}}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Family member not found")
    return {"ok": True}


# ---------------- Refill reminders ----------------
@api_router.get("/refills")
async def list_refills(user: dict = Depends(current_user)) -> list:
    return await db.refills.find(
        {"user_id": user["id"], "status": "upcoming"},
        {"_id": 0, "user_id": 0},
    ).sort("next_refill_at", 1).to_list(100)


@api_router.post("/refills/{refill_id}/reorder")
async def reorder_refill(refill_id: str, payload: RefillReorderInput, user: dict = Depends(current_user)) -> dict:
    if not await db.refills.find_one({"id": refill_id, "user_id": user["id"]}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Refill not found")
    raise HTTPException(status_code=409, detail="Refills must be resubmitted as a medicine request and rechecked by a pharmacist")


# ---------------- Razorpay ----------------
@api_router.get("/payments/razorpay/config")
async def razorpay_config() -> dict:
    return {"ready": _razorpay_ready, "key_id": RAZORPAY_KEY_ID if _razorpay_ready else ""}


@api_router.post("/payments/razorpay/order")
async def razorpay_create_order(payload: RazorpayOrderInput, user: dict = Depends(current_user)) -> dict:
    if not rzp_client:
        raise HTTPException(status_code=503, detail="Online payment is not enabled yet. Add Razorpay keys to enable it.")
    order = await db.orders.find_one({"id": payload.order_id, "user_id": user["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    amount_paise = int(round(order["total"] * 100))
    if amount_paise < 100:
        raise HTTPException(status_code=400, detail="Minimum payable amount is ₹1")
    receipt = f"jl_{order['id']}"[:40]
    rzp_order = rzp_client.order.create({
        "amount": amount_paise, "currency": "INR", "receipt": receipt,
        "notes": {"local_order_id": order["id"], "user_id": user["id"]},
    })
    await db.orders.update_one(
        {"id": order["id"]},
        {"$set": {"razorpay_order_id": rzp_order["id"], "payment_status": "created"}},
    )
    return {
        "order_id": order["id"], "razorpay_order_id": rzp_order["id"],
        "amount": amount_paise, "currency": "INR", "key_id": RAZORPAY_KEY_ID,
        "customer": {"name": user.get("name"), "email": user.get("email"), "phone": user.get("phone")},
    }


@api_router.post("/payments/razorpay/verify")
async def razorpay_verify(payload: RazorpayVerifyInput, user: dict = Depends(current_user)) -> dict:
    order = await db.orders.find_one({"id": payload.order_id, "user_id": user["id"]}, {"_id": 0})
    if not order or order.get("razorpay_order_id") != payload.razorpay_order_id:
        raise HTTPException(status_code=400, detail="Unknown payment")
    message = f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode()
    expected = hmac.new(RAZORPAY_KEY_SECRET.encode(), message, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, payload.razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid payment signature")
    await db.orders.update_one(
        {"id": order["id"], "payment_status": {"$ne": "paid"}},
        {"$set": {"payment_status": "paid", "razorpay_payment_id": payload.razorpay_payment_id, "paid_at": now_iso()}},
    )
    return {"ok": True, "status": "paid"}


@api_router.post("/payments/razorpay/webhook")
async def razorpay_webhook(request: Request) -> dict:
    raw = await request.body()
    supplied = request.headers.get("x-razorpay-signature", "")
    expected = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, supplied):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    event = json.loads(raw)
    if event.get("event") in {"payment.captured", "order.paid"}:
        payment = event.get("payload", {}).get("payment", {}).get("entity", {})
        rp_order_id = payment.get("order_id")
        if rp_order_id:
            await db.orders.update_one(
                {"razorpay_order_id": rp_order_id, "payment_status": {"$ne": "paid"}},
                {"$set": {"payment_status": "paid", "razorpay_payment_id": payment.get("id"), "paid_at": now_iso()}},
            )
    return {"ok": True}


app.include_router(api_router)
app.include_router(build_admin_router(db, now_iso, request_stats))
app.include_router(build_pharmacy_router(db=db, jwt_secret=JWT_SECRET, now_iso=now_iso, customer_dependency=current_user))
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client() -> None:
    client.close()
