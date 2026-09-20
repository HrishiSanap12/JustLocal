from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional
import base64
import hashlib
import hmac
import json
import logging
import os
import re
import uuid

import bcrypt
import httpx
import jwt
import razorpay
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

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


class AuthInput(BaseModel):
    identifier: str
    password: str


class RegisterInput(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    password: str


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


class AddressInput(BaseModel):
    label: str
    address: str
    phone: Optional[str] = None


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
        "phone": document.get("phone"),
        "addresses": document.get("addresses", []),
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
    categories = [
        ("Prescription Medicines", "medkit", "Medicines"),
        ("OTC Medicines", "bandage", "Medicines"),
        ("Vitamins & Supplements", "leaf", "Wellness"),
        ("Pain Relief", "flash", "Medicines"),
        ("Cold & Cough", "cloud", "Medicines"),
        ("Diabetes Care", "water", "Wellness"),
        ("Personal Care", "sparkles", "Personal Care"),
        ("Baby Care", "happy", "Family Care"),
        ("Health Devices", "thermometer", "Healthcare Devices"),
        ("First Aid", "medkit", "Healthcare Devices"),
        ("Skin Care", "flower", "Personal Care"),
        ("Oral Care", "smile", "Personal Care"),
    ]
    if await db.categories.count_documents({}) == 0:
        await db.categories.insert_many([
            {"id": f"cat-{index}", "name": name, "icon": icon, "group": group, "count": 18 + index * 7}
            for index, (name, icon, group) in enumerate(categories)
        ])
    else:
        # Ensure any legacy invalid icons are patched.
        await db.categories.update_many({"icon": "medical-bag"}, {"$set": {"icon": "medkit"}})

    medicines = [
        ("Paracetamol 500mg", "Strip of 10", "Cipla", 25, "OTC Medicines", False),
        ("Vitamin D3 60000 IU", "Strip of 4", "Uprise", 120, "Vitamins & Supplements", False),
        ("Crocin 500mg", "Strip of 10", "GSK", 34, "OTC Medicines", False),
        ("Cetirizine 10mg", "Strip of 10", "Dr. Reddy's", 42, "OTC Medicines", False),
        ("Amoxicillin 500mg", "Strip of 10", "Alkem", 86, "Prescription Medicines", True),
        ("Pantoprazole 40mg", "Strip of 10", "Sun Pharma", 74, "Prescription Medicines", True),
        ("Centrum Multivitamin", "Bottle of 30", "Haleon", 250, "Vitamins & Supplements", False),
        ("Revital H Capsule", "Strip of 10", "Sun Pharma", 150, "Vitamins & Supplements", False),
        ("OneTouch Glucometer", "1 device", "LifeScan", 899, "Health Devices", False),
        ("Savlon Antiseptic", "100ml bottle", "ITC", 89, "First Aid", False),
    ]
    if await db.medicines.count_documents({}) == 0:
        await db.medicines.insert_many([
            {
                "id": f"med-{index + 1}",
                "name": name,
                "pack": pack,
                "manufacturer": manufacturer,
                "price": price,
                "category": category,
                "prescription_required": prescription_required,
                "composition": "As listed on pack. Follow label directions.",
                "availability": "In stock" if index != 5 else "Low stock",
                "nearby_stores": 3 + index % 4,
                "image_color": ["#CCFBF1", "#DBEAFE", "#FEF3C7", "#FCE7F3"][index % 4],
            }
            for index, (name, pack, manufacturer, price, category, prescription_required) in enumerate(medicines)
        ])

    if await db.pharmacies.count_documents({}) == 0:
        await db.pharmacies.insert_many([
            {"id": "pharmacy-1", "name": "Apollo Pharmacy", "area": "Hiranandani Estate", "distance": "1.2 km", "eta": "10–15 min", "rating": 4.6, "reviews": "1.2k", "threshold": 299, "status": "Open"},
            {"id": "pharmacy-2", "name": "MedPlus", "area": "Thane West", "distance": "2.4 km", "eta": "15–20 min", "rating": 4.4, "reviews": "980", "threshold": 199, "status": "Open"},
            {"id": "pharmacy-3", "name": "Sun Pharma Store", "area": "Kasarvadavali", "distance": "3.1 km", "eta": "20–25 min", "rating": 4.5, "reviews": "640", "threshold": 299, "status": "Open"},
        ])

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
            "name": "Aarav Mehta",
            "email": demo_email,
            "phone": "+91 98765 43210",
            "password_hash": bcrypt.hashpw(b"Justlocal123!", bcrypt.gensalt()).decode(),
            "addresses": [{"id": "addr-1", "label": "Home", "address": "Hiranandani Estate, Thane West, Mumbai - 400607", "phone": "+91 98765 43210", "default": True}],
            "created_at": now_iso(),
        }
        await db.users.insert_one(demo)
    if await db.orders.count_documents({"user_id": "user-demo"}) == 0:
        await db.orders.insert_one({
            "id": "order-demo-1", "user_id": "user-demo", "order_number": "JL240921873", "pharmacy_id": "pharmacy-1",
            "pharmacy_name": "Apollo Pharmacy", "items": [{"medicine_id": "med-1", "name": "Crocin 500mg", "quantity": 1, "price": 34}],
            "address": "Hiranandani Estate, Thane West, Mumbai - 400607", "delivery_method": "delivery", "subtotal": 342, "discount": 0, "delivery_fee": 0, "total": 342,
            "status": "Delivered", "created_at": "2025-09-20T10:24:00+00:00", "eta": "Delivered", "timeline": ["Order Placed", "Pharmacy Confirmed", "Preparing", "Out for Delivery", "Delivered"],
        })

    # Indexes for auth flows
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.users.create_index("apple_sub", unique=True, sparse=True)


@app.on_event("startup")
async def startup_event() -> None:
    await seed_database()


@api_router.get("/")
async def root() -> dict:
    return {"message": "Justlocal API is ready"}


# ---------------- Email / phone auth ----------------
@api_router.post("/auth/register")
async def register(payload: RegisterInput) -> dict:
    email = payload.email.strip().lower()
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if await db.users.find_one({"email": email}, {"_id": 0}):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    document = {
        "id": f"user-{uuid.uuid4().hex[:10]}", "name": payload.name.strip(), "email": email, "phone": payload.phone,
        "password_hash": bcrypt.hashpw(payload.password.encode(), bcrypt.gensalt()).decode(), "addresses": [], "created_at": now_iso(),
    }
    await db.users.insert_one(document)
    return public_auth(document)


@api_router.post("/auth/login")
async def login(payload: AuthInput) -> dict:
    identifier = payload.identifier.strip().lower()
    user = await db.users.find_one({"$or": [{"email": identifier}, {"phone": payload.identifier.strip()}]}, {"_id": 0})
    if not user or not bcrypt.checkpw(payload.password.encode(), user.get("password_hash", "").encode()):
        raise HTTPException(status_code=401, detail="We couldn't match those details")
    return public_auth(user)


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
    if not user and (payload.email or apple_email):
        candidate = (payload.email or apple_email or "").lower()
        user = await db.users.find_one({"email": candidate}, {"_id": 0})
    if not user:
        user = {
            "id": f"user-{uuid.uuid4().hex[:10]}",
            "name": payload.name or "Apple user",
            "email": (payload.email or apple_email or "").lower(),
            "phone": None,
            "apple_sub": apple_sub,
            "addresses": [],
            "created_at": now_iso(),
        }
        await db.users.insert_one(user)
    else:
        updates: dict = {"apple_sub": apple_sub}
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
    if not user:
        user = {
            "id": f"user-{uuid.uuid4().hex[:10]}",
            "name": data.get("name") or "Justlocal member",
            "email": email,
            "phone": None,
            "picture": data.get("picture"),
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


@api_router.get("/medicines")
async def medicines(category: Optional[str] = None, search: Optional[str] = None) -> list:
    query: dict = {}
    if category and category != "All":
        query["category"] = {"$regex": f"^{re.escape(category)}$", "$options": "i"}
    if search:
        query["$or"] = [{"name": {"$regex": re.escape(search), "$options": "i"}}, {"category": {"$regex": re.escape(search), "$options": "i"}}]
    return await db.medicines.find(query, {"_id": 0}).to_list(100)


@api_router.get("/pharmacies")
async def pharmacies() -> list:
    return await db.pharmacies.find({}, {"_id": 0}).to_list(50)


@api_router.get("/offers")
async def offers() -> list:
    return await db.offers.find({}, {"_id": 0}).to_list(50)


# ---------------- Orders ----------------
@api_router.get("/orders")
async def orders(user: dict = Depends(current_user)) -> list:
    return await db.orders.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(100)


@api_router.post("/orders")
async def create_order(payload: OrderCreate, user: dict = Depends(current_user)) -> dict:
    pharmacy = await db.pharmacies.find_one({"id": payload.pharmacy_id}, {"_id": 0})
    document = {
        "id": f"order-{uuid.uuid4().hex[:10]}", "user_id": user["id"],
        "order_number": f"JL{datetime.now(timezone.utc).strftime('%y%m%d')}{uuid.uuid4().hex[:3].upper()}",
        "pharmacy_id": payload.pharmacy_id, "pharmacy_name": pharmacy["name"] if pharmacy else "Local pharmacy",
        "items": [item.model_dump() for item in payload.items],
        "address": payload.address, "delivery_method": payload.delivery_method, "subtotal": payload.subtotal,
        "discount": payload.discount, "delivery_fee": payload.delivery_fee, "total": payload.total,
        "payment_status": "pending", "status": "Order Placed", "created_at": now_iso(),
        "eta": "Arriving in 25–35 min",
        "timeline": ["Order Placed", "Pharmacy Confirmed", "Preparing", "Out for Delivery", "Delivered"],
    }
    await db.orders.insert_one(document)
    return {key: value for key, value in document.items() if key not in {"_id", "user_id"}}


@api_router.post("/prescriptions")
async def upload_prescription(file: UploadFile = File(...), user: dict = Depends(current_user)) -> dict:
    contents = await file.read()
    if len(contents) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Please choose an image smaller than 8 MB")
    prescription = {
        "id": f"rx-{uuid.uuid4().hex[:10]}", "user_id": user["id"], "filename": file.filename or "prescription.jpg",
        "content_type": file.content_type or "image/jpeg", "data": base64.b64encode(contents).decode(),
        "status": "Awaiting pharmacist review", "created_at": now_iso(),
    }
    await db.prescriptions.insert_one(prescription)
    return {"id": prescription["id"], "filename": prescription["filename"], "status": prescription["status"]}


@api_router.post("/addresses")
async def add_address(payload: AddressInput, user: dict = Depends(current_user)) -> dict:
    address = {"id": f"addr-{uuid.uuid4().hex[:8]}", "label": payload.label, "address": payload.address, "phone": payload.phone or user.get("phone"), "default": len(user.get("addresses", [])) == 0}
    await db.users.update_one({"id": user["id"]}, {"$push": {"addresses": address}})
    return address


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
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client() -> None:
    client.close()
