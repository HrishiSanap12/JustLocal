from datetime import datetime, timedelta, timezone
import hmac
import os
import re
import uuid
from math import atan2, cos, radians, sin, sqrt
from typing import Literal, Optional

import bcrypt
import jwt
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field


def build_pharmacy_router(db, jwt_secret: str, now_iso, customer_dependency) -> APIRouter:
    router = APIRouter(prefix="/api")

    class PharmacistRegister(BaseModel):
        name: str = Field(min_length=2, max_length=100)
        email: str = Field(min_length=5, max_length=254)
        phone: str = Field(min_length=8, max_length=24)
        password: str = Field(min_length=12, max_length=128)
        pharmacy_name: str = Field(min_length=2, max_length=160)
        license_number: str = Field(min_length=4, max_length=80)
        address: str = Field(min_length=8, max_length=400)
        latitude: float = Field(ge=-90, le=90)
        longitude: float = Field(ge=-180, le=180)

    class PharmacistLogin(BaseModel):
        email: str
        password: str

    class RequestItem(BaseModel):
        medicine_id: Optional[str] = None
        requested_name: Optional[str] = Field(default=None, min_length=2, max_length=160)
        quantity: int = Field(ge=1, le=100)

    class CustomerRequestCreate(BaseModel):
        items: list[RequestItem] = Field(default_factory=list, max_length=30)
        prescription_id: Optional[str] = None
        prescription_share_consent: bool = False
        address: str = Field(min_length=4, max_length=500)
        latitude: float = Field(ge=-90, le=90)
        longitude: float = Field(ge=-180, le=180)
        for_profile_id: Optional[str] = None
        for_profile_name: Optional[str] = None

    class OfferItem(BaseModel):
        medicine_id: Optional[str] = None
        requested_name: Optional[str] = Field(default=None, min_length=2, max_length=160)
        unit_price: Optional[float] = Field(default=None, ge=0, le=1000000)
        quantity: int = Field(ge=1, le=100)

    class PharmacistOffer(BaseModel):
        availability: Literal["available", "partial", "unavailable"]
        prescription_decision: Optional[Literal["matches", "clarification", "not-approved"]] = None
        items: list[OfferItem] = Field(default_factory=list, max_length=30)
        eta_minutes: int = Field(default=30, ge=5, le=240)
        note: Optional[str] = Field(default=None, max_length=300)

    class PrescriptionReviewInput(BaseModel):
        decision: Literal["matches", "clarification", "not-approved"]
        reason: Optional[str] = Field(default=None, max_length=300)

    class CarryListWrite(BaseModel):
        medicine_id: str
        price: float = Field(ge=0, le=1000000)
        carried: bool = True

    class CarryListUpdate(BaseModel):
        price: Optional[float] = Field(default=None, ge=0, le=1000000)
        carried: Optional[bool] = None

    class AvailabilityUpdate(BaseModel):
        accepting_requests: bool

    class SelectOfferInput(BaseModel):
        offer_id: str
        payment_method: Literal["cod", "razorpay"] = "cod"

    class OrderStatusUpdate(BaseModel):
        status: Literal["Preparing", "Out for Delivery", "Delivered"]

    def issue_token(account: dict) -> tuple[str, str, datetime]:
        session_id = uuid.uuid4().hex
        expiry = datetime.now(timezone.utc) + timedelta(hours=12)
        token = jwt.encode(
            {
                "sub": account["id"],
                "role": "pharmacist",
                "pharmacy_id": account["pharmacy_id"],
                "aud": "justlocal-pharmacist",
                "jti": session_id,
                "exp": expiry,
            },
            jwt_secret,
            algorithm="HS256",
        )
        return token, session_id, expiry

    async def current_pharmacist(authorization: Optional[str] = Header(default=None)) -> dict:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Pharmacist sign-in required")
        token = authorization.split(" ", 1)[1]
        try:
            claims = jwt.decode(token, jwt_secret, algorithms=["HS256"], audience="justlocal-pharmacist")
        except jwt.PyJWTError as exc:
            raise HTTPException(status_code=401, detail="Pharmacist session is invalid or expired") from exc
        if claims.get("role") != "pharmacist":
            raise HTTPException(status_code=403, detail="Pharmacist access required")
        session = await db.pharmacist_sessions.find_one({"id": claims.get("jti"), "account_id": claims.get("sub")})
        if not session:
            raise HTTPException(status_code=401, detail="Pharmacist session has ended")
        account = await db.pharmacist_accounts.find_one({"id": claims.get("sub"), "status": "verified"}, {"_id": 0, "password_hash": 0})
        if not account:
            raise HTTPException(status_code=403, detail="Pharmacist account is not verified")
        pharmacy = await db.pharmacies.find_one({"id": account["pharmacy_id"], "verification_status": "verified"}, {"_id": 0})
        if not pharmacy:
            raise HTTPException(status_code=403, detail="Pharmacy is not verified")
        return {"account": account, "pharmacy": pharmacy, "session_id": claims["jti"]}

    def distance_km(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> float:
        earth_radius = 6371.0
        delta_latitude = radians(latitude_b - latitude_a)
        delta_longitude = radians(longitude_b - longitude_a)
        value = sin(delta_latitude / 2) ** 2 + cos(radians(latitude_a)) * cos(radians(latitude_b)) * sin(delta_longitude / 2) ** 2
        return earth_radius * 2 * atan2(sqrt(value), sqrt(1 - value))

    def private_customer_request(document: dict) -> dict:
        return {key: value for key, value in document.items() if key not in {"_id", "user_id", "address", "latitude", "longitude"}}

    async def customer_request_view(document: dict) -> dict:
        if document.get("status") == "collecting_offers" and document.get("expires_at"):
            if datetime.fromisoformat(document["expires_at"]) <= datetime.now(timezone.utc):
                await db.medicine_requests.update_one({"id": document["id"], "status": "collecting_offers"}, {"$set": {"status": "expired"}})
                await db.pharmacy_request_assignments.update_many({"request_id": document["id"], "status": {"$in": ["invited", "reviewing"]}}, {"$set": {"status": "expired", "closed_at": now_iso()}})
                document["status"] = "expired"
        assignments = await db.pharmacy_request_assignments.find({"request_id": document["id"]}, {"_id": 0}).to_list(100)
        assignment_by_pharmacy = {assignment["pharmacy_id"]: assignment for assignment in assignments}
        offers = await db.pharmacy_offers.find({"request_id": document["id"]}, {"_id": 0}).sort("created_at", 1).to_list(100)
        pharmacy_ids = list({offer["pharmacy_id"] for offer in offers})
        pharmacies = await db.pharmacies.find({"id": {"$in": pharmacy_ids}}, {"_id": 0}).to_list(20) if pharmacy_ids else []
        pharmacy_by_id = {pharmacy["id"]: pharmacy for pharmacy in pharmacies}
        visible_offers = []
        for offer in offers:
            pharmacy = pharmacy_by_id.get(offer["pharmacy_id"], {})
            assignment = assignment_by_pharmacy.get(offer["pharmacy_id"], {})
            visible_offers.append({
                "id": offer["id"],
                "pharmacy_id": offer["pharmacy_id"],
                "pharmacy_name": pharmacy.get("name", "Nearby pharmacy"),
                "area": pharmacy.get("area", "Nearby"),
                "distance_km": assignment.get("distance_km"),
                "availability": offer["availability"],
                "prescription_decision": offer.get("prescription_decision"),
                "items": offer["items"],
                "subtotal": offer["subtotal"],
                "delivery_fee": offer["delivery_fee"],
                "total": offer["total"],
                "eta_minutes": offer["eta_minutes"],
                "note": offer.get("note"),
                "status": offer["status"],
                "created_at": offer["created_at"],
                "expires_at": offer["expires_at"],
            })
        result = private_customer_request(document)
        result["offers"] = visible_offers
        result["matched_pharmacy_count"] = len(assignments)
        return result

    @router.post("/pharmacist/auth/register", status_code=202)
    async def pharmacist_register(payload: PharmacistRegister) -> dict:
        email = payload.email.strip().lower()
        license_number = payload.license_number.strip().upper()
        if await db.pharmacist_accounts.find_one({"email": email}):
            raise HTTPException(status_code=409, detail="An account with this email already exists")
        if await db.pharmacies.find_one({"license_number": license_number}):
            raise HTTPException(status_code=409, detail="This pharmacy license is already registered")
        pharmacy_id = f"pharmacy-{uuid.uuid4().hex[:12]}"
        account_id = f"pharmacist-{uuid.uuid4().hex[:12]}"
        await db.pharmacies.insert_one({
            "id": pharmacy_id,
            "name": payload.pharmacy_name.strip(),
            "area": payload.address.strip(),
            "address": payload.address.strip(),
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "geo_location": {"type": "Point", "coordinates": [payload.longitude, payload.latitude]},
            "license_number": license_number,
            "verification_status": "pending",
            "accepting_requests": False,
            "created_at": now_iso(),
        })
        await db.pharmacist_accounts.insert_one({
            "id": account_id,
            "pharmacy_id": pharmacy_id,
            "name": payload.name.strip(),
            "email": email,
            "phone": payload.phone.strip(),
            "password_hash": bcrypt.hashpw(payload.password.encode(), bcrypt.gensalt()).decode(),
            "status": "pending",
            "created_at": now_iso(),
        })
        return {"pharmacy_id": pharmacy_id, "status": "pending", "message": "Application submitted for manual verification."}

    @router.post("/pharmacist/auth/login")
    async def pharmacist_login(payload: PharmacistLogin) -> dict:
        account = await db.pharmacist_accounts.find_one({"email": payload.email.strip().lower()})
        password_hash = account.get("password_hash", "") if account else ""
        if not account or not bcrypt.checkpw(payload.password.encode(), password_hash.encode()):
            raise HTTPException(status_code=401, detail="Email or password is incorrect")
        if account.get("status") != "verified":
            raise HTTPException(status_code=403, detail="Your pharmacy application is awaiting manual verification")
        pharmacy = await db.pharmacies.find_one({"id": account["pharmacy_id"], "verification_status": "verified"})
        if not pharmacy:
            raise HTTPException(status_code=403, detail="Your pharmacy is not verified")
        token, session_id, expiry = issue_token(account)
        await db.pharmacist_sessions.insert_one({"id": session_id, "account_id": account["id"], "expires_at": expiry, "created_at": datetime.now(timezone.utc)})
        return {"token": token, "pharmacist": {"id": account["id"], "name": account["name"], "email": account["email"], "pharmacy_id": pharmacy["id"], "pharmacy_name": pharmacy["name"], "status": "verified"}}

    @router.post("/pharmacist/auth/logout")
    async def pharmacist_logout(pharmacist: dict = Depends(current_pharmacist)) -> dict:
        await db.pharmacist_sessions.delete_one({"id": pharmacist["session_id"]})
        return {"ok": True}

    @router.get("/pharmacist/me")
    async def pharmacist_me(pharmacist: dict = Depends(current_pharmacist)) -> dict:
        account = pharmacist["account"]
        pharmacy = pharmacist["pharmacy"]
        return {"id": account["id"], "name": account["name"], "email": account["email"], "pharmacy_id": pharmacy["id"], "pharmacy_name": pharmacy["name"], "area": pharmacy.get("area", ""), "accepting_requests": pharmacy.get("accepting_requests", False)}

    def require_admin(token: Optional[str]) -> None:
        expected = os.environ.get("PHARMACY_ADMIN_TOKEN", "")
        if not expected:
            raise HTTPException(status_code=503, detail="Pharmacy verification is not configured")
        if not token or not hmac.compare_digest(token, expected):
            raise HTTPException(status_code=401, detail="Admin verification required")

    @router.get("/admin/pharmacies/pending")
    async def pending_pharmacies(x_pharmacy_admin_token: Optional[str] = Header(default=None)) -> list:
        require_admin(x_pharmacy_admin_token)
        pharmacies = await db.pharmacies.find({"verification_status": "pending"}, {"_id": 0}).to_list(100)
        if not pharmacies:
            return []
        accounts = await db.pharmacist_accounts.find(
            {"pharmacy_id": {"$in": [pharmacy["id"] for pharmacy in pharmacies]}, "status": "pending"},
            {"_id": 0, "password_hash": 0},
        ).to_list(100)
        account_by_pharmacy = {account["pharmacy_id"]: account for account in accounts}
        return [
            {
                **pharmacy,
                "pharmacist": {
                    key: account_by_pharmacy[pharmacy["id"]].get(key)
                    for key in ("id", "name", "email", "phone")
                } if pharmacy["id"] in account_by_pharmacy else None,
            }
            for pharmacy in pharmacies
        ]

    @router.post("/admin/pharmacies/{pharmacy_id}/verify")
    async def verify_pharmacy(pharmacy_id: str, x_pharmacy_admin_token: Optional[str] = Header(default=None)) -> dict:
        require_admin(x_pharmacy_admin_token)
        pharmacy = await db.pharmacies.find_one({"id": pharmacy_id, "verification_status": "pending"})
        if not pharmacy:
            raise HTTPException(status_code=404, detail="Pending pharmacy not found")
        await db.pharmacies.update_one({"id": pharmacy_id}, {"$set": {"verification_status": "verified", "verified_at": now_iso(), "accepting_requests": True}})
        await db.pharmacist_accounts.update_many({"pharmacy_id": pharmacy_id, "status": "pending"}, {"$set": {"status": "verified", "verified_at": now_iso()}})
        return {"pharmacy_id": pharmacy_id, "status": "verified"}

    @router.patch("/pharmacist/availability")
    async def update_availability(payload: AvailabilityUpdate, pharmacist: dict = Depends(current_pharmacist)) -> dict:
        pharmacy_id = pharmacist["pharmacy"]["id"]
        await db.pharmacies.update_one({"id": pharmacy_id}, {"$set": {"accepting_requests": payload.accepting_requests, "availability_updated_at": now_iso()}})
        return {"accepting_requests": payload.accepting_requests}

    @router.get("/pharmacist/catalog")
    async def pharmacist_catalog(search: Optional[str] = None, pharmacist: dict = Depends(current_pharmacist)) -> list:
        query: dict = {}
        if search:
            escaped = re.escape(search.strip())
            query["$or"] = [{"name": {"$regex": escaped, "$options": "i"}}, {"manufacturer": {"$regex": escaped, "$options": "i"}}, {"composition": {"$regex": escaped, "$options": "i"}}]
        products = await db.medicines.find(query, {"_id": 0}).to_list(200)
        pharmacy_id = pharmacist["pharmacy"]["id"]
        entries = await db.pharmacy_carry_list.find({"pharmacy_id": pharmacy_id}, {"_id": 0}).to_list(500)
        by_medicine = {entry["medicine_id"]: entry for entry in entries}
        return [{**product, "carried": bool(by_medicine.get(product["id"], {}).get("carried", False)), "pharmacy_price": by_medicine.get(product["id"], {}).get("price")} for product in products]

    @router.get("/pharmacist/carry-list")
    async def get_carry_list(pharmacist: dict = Depends(current_pharmacist)) -> list:
        pharmacy_id = pharmacist["pharmacy"]["id"]
        entries = await db.pharmacy_carry_list.find({"pharmacy_id": pharmacy_id, "carried": True}, {"_id": 0}).to_list(500)
        product_ids = [entry["medicine_id"] for entry in entries]
        products = await db.medicines.find({"id": {"$in": product_ids}}, {"_id": 0}).to_list(500) if product_ids else []
        product_by_id = {product["id"]: product for product in products}
        return [{**product_by_id[entry["medicine_id"]], "carried": True, "pharmacy_price": entry["price"], "updated_at": entry["updated_at"]} for entry in entries if entry["medicine_id"] in product_by_id]

    @router.post("/pharmacist/carry-list")
    async def save_carry_list(payload: CarryListWrite, pharmacist: dict = Depends(current_pharmacist)) -> dict:
        product = await db.medicines.find_one({"id": payload.medicine_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail="Medicine not found in the shared catalog")
        maximum_price = float(product.get("mrp", product.get("price", 0)))
        if payload.price > maximum_price:
            raise HTTPException(status_code=422, detail="Pharmacy price cannot exceed the catalog maximum retail price")
        pharmacy_id = pharmacist["pharmacy"]["id"]
        document = {"pharmacy_id": pharmacy_id, "medicine_id": payload.medicine_id, "price": payload.price, "carried": payload.carried, "updated_at": now_iso()}
        await db.pharmacy_carry_list.update_one({"pharmacy_id": pharmacy_id, "medicine_id": payload.medicine_id}, {"$set": document}, upsert=True)
        return {**product, "carried": payload.carried, "pharmacy_price": payload.price, "updated_at": document["updated_at"]}

    @router.patch("/pharmacist/carry-list/{medicine_id}")
    async def update_carry_list(medicine_id: str, payload: CarryListUpdate, pharmacist: dict = Depends(current_pharmacist)) -> dict:
        pharmacy_id = pharmacist["pharmacy"]["id"]
        update = {key: value for key, value in payload.model_dump(exclude_unset=True).items() if value is not None}
        if not update:
            raise HTTPException(status_code=400, detail="Provide a price or carried state")
        if "price" in update:
            product = await db.medicines.find_one({"id": medicine_id}, {"_id": 0})
            if not product:
                raise HTTPException(status_code=404, detail="Medicine not found in the shared catalog")
            maximum_price = float(product.get("mrp", product.get("price", 0)))
            if update["price"] > maximum_price:
                raise HTTPException(status_code=422, detail="Pharmacy price cannot exceed the catalog maximum retail price")
        update["updated_at"] = now_iso()
        result = await db.pharmacy_carry_list.update_one({"pharmacy_id": pharmacy_id, "medicine_id": medicine_id}, {"$set": update})
        if result.matched_count != 1:
            raise HTTPException(status_code=404, detail="Medicine is not on this pharmacy's carry list")
        return {"medicine_id": medicine_id, **update}

    @router.post("/medicine-requests")
    async def create_medicine_request(payload: CustomerRequestCreate, user: dict = Depends(customer_dependency)) -> dict:
        if not payload.items and not payload.prescription_id:
            raise HTTPException(status_code=422, detail="Add medicines or upload a prescription")
        if payload.prescription_id and not payload.prescription_share_consent:
            raise HTTPException(status_code=422, detail="Consent is required to share the prescription with matched pharmacies")
        if payload.for_profile_id and not any(member.get("id") == payload.for_profile_id for member in user.get("family_members", [])):
            raise HTTPException(status_code=400, detail="Family profile does not belong to this account")

        prescription = None
        if payload.prescription_id:
            prescription = await db.prescriptions.find_one({"id": payload.prescription_id, "user_id": user["id"]}, {"_id": 0, "data": 0})
            if not prescription:
                raise HTTPException(status_code=404, detail="Prescription not found for this account")

        if any(bool(item.medicine_id) == bool(item.requested_name) for item in payload.items):
            raise HTTPException(status_code=422, detail="Each request line needs either a catalog medicine or a typed medicine name")
        item_ids = [item.medicine_id for item in payload.items if item.medicine_id]
        custom_names = [item.requested_name.strip().casefold() for item in payload.items if item.requested_name]
        if len(set(item_ids)) != len(item_ids) or len(set(custom_names)) != len(custom_names):
            raise HTTPException(status_code=422, detail="Each medicine can only appear once")
        products = await db.medicines.find({"id": {"$in": item_ids}}, {"_id": 0}).to_list(100) if item_ids else []
        product_by_id = {product["id"]: product for product in products}
        if len(product_by_id) != len(item_ids):
            raise HTTPException(status_code=422, detail="One or more medicines are not in the catalog")
        if any(product_by_id[item.medicine_id].get("prescription_required") for item in payload.items if item.medicine_id) and not prescription:
            raise HTTPException(status_code=422, detail="Upload a prescription for prescription-required medicines")

        request_id = f"request-{uuid.uuid4().hex[:12]}"
        request_items = []
        for item in payload.items:
            if item.medicine_id:
                product = product_by_id[item.medicine_id]
                request_items.append({"medicine_id": item.medicine_id, "name": product["name"], "pack": product.get("pack", ""), "quantity": item.quantity, "prescription_required": bool(product.get("prescription_required")), "custom": False})
            else:
                requested_name = item.requested_name.strip()
                request_items.append({"medicine_id": None, "requested_name": requested_name, "name": requested_name, "pack": "Customer supplied details", "quantity": item.quantity, "prescription_required": False, "custom": True})
        request_doc = {
            "id": request_id,
            "user_id": user["id"],
            "patient_name": payload.for_profile_name or user.get("name", "Customer"),
            "items": request_items,
            "prescription_id": payload.prescription_id,
            "prescription_share_consent": payload.prescription_share_consent,
            "address": payload.address.strip(),
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "for_profile_id": payload.for_profile_id,
            "for_profile_name": payload.for_profile_name,
            "status": "dispatching",
            "selected_offer_id": None,
            "created_at": now_iso(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat(),
        }
        await db.medicine_requests.insert_one(request_doc)

        candidate_pharmacies = await db.pharmacies.find(
            {"verification_status": "verified", "accepting_requests": True}, {"_id": 0}
        ).to_list(100)
        candidates = []
        for pharmacy in candidate_pharmacies:
            pharmacy_latitude = pharmacy.get("latitude")
            pharmacy_longitude = pharmacy.get("longitude")
            distance = None
            if isinstance(pharmacy_latitude, (int, float)) and isinstance(pharmacy_longitude, (int, float)):
                distance = distance_km(payload.latitude, payload.longitude, pharmacy_latitude, pharmacy_longitude)
            candidates.append((distance, pharmacy))
        candidates.sort(key=lambda pair: pair[0] if pair[0] is not None else float("inf"))
        assignments = [{
            "id": f"assignment-{uuid.uuid4().hex[:12]}",
            "request_id": request_id,
            "pharmacy_id": pharmacy["id"],
            "status": "invited",
            "distance_km": round(distance, 2) if distance is not None else None,
            "created_at": now_iso(),
        } for distance, pharmacy in candidates]
        if assignments:
            await db.pharmacy_request_assignments.insert_many(assignments)
        status = "collecting_offers" if assignments else "no_pharmacies"
        await db.medicine_requests.update_one({"id": request_id}, {"$set": {"status": status, "matched_pharmacy_count": len(assignments)}})
        request_doc["status"] = status
        request_doc["matched_pharmacy_count"] = len(assignments)
        return {**private_customer_request(request_doc), "offers": []}

    @router.get("/medicine-requests")
    async def list_customer_requests(user: dict = Depends(customer_dependency)) -> list:
        documents = await db.medicine_requests.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
        return [await customer_request_view(document) for document in documents]

    @router.get("/medicine-requests/{request_id}")
    async def get_customer_request(request_id: str, user: dict = Depends(customer_dependency)) -> dict:
        document = await db.medicine_requests.find_one({"id": request_id, "user_id": user["id"]}, {"_id": 0})
        if not document:
            raise HTTPException(status_code=404, detail="Request not found")
        return await customer_request_view(document)

    @router.delete("/medicine-requests/{request_id}")
    async def revoke_customer_request(request_id: str, user: dict = Depends(customer_dependency)) -> dict:
        request_doc = await db.medicine_requests.find_one({"id": request_id, "user_id": user["id"]}, {"_id": 0})
        if not request_doc:
            raise HTTPException(status_code=404, detail="Request not found")
        revocable_statuses = ["collecting_offers", "no_pharmacies"]
        if request_doc.get("status") not in revocable_statuses:
            raise HTTPException(status_code=409, detail="This request can no longer be withdrawn")
        revoked_at = now_iso()
        result = await db.medicine_requests.update_one(
            {"id": request_id, "user_id": user["id"], "status": {"$in": revocable_statuses}},
            {"$set": {"status": "revoked", "revoked_at": revoked_at}},
        )
        if result.modified_count != 1:
            raise HTTPException(status_code=409, detail="This request can no longer be withdrawn")
        await db.pharmacy_request_assignments.update_many(
            {"request_id": request_id, "status": {"$in": ["invited", "reviewing", "offered", "unavailable", "needs_clarification", "not_approved"]}},
            {"$set": {"status": "revoked", "closed_at": revoked_at}},
        )
        await db.pharmacy_offers.update_many(
            {"request_id": request_id, "status": "offered"},
            {"$set": {"status": "revoked", "revoked_at": revoked_at}},
        )
        return {"id": request_id, "status": "revoked"}

    @router.get("/pharmacist/requests")
    async def list_pharmacist_requests(pharmacist: dict = Depends(current_pharmacist)) -> list:
        pharmacy_id = pharmacist["pharmacy"]["id"]
        assignments = await db.pharmacy_request_assignments.find({"pharmacy_id": pharmacy_id, "status": {"$in": ["invited", "reviewing", "offered", "unavailable", "needs_clarification", "not_approved"]}}, {"_id": 0}).sort("created_at", -1).to_list(100)
        requests = await db.medicine_requests.find({"id": {"$in": [assignment["request_id"] for assignment in assignments]}, "status": {"$in": ["collecting_offers", "order_placed"]}}, {"_id": 0, "user_id": 0, "address": 0, "latitude": 0, "longitude": 0}).to_list(100) if assignments else []
        request_by_id = {request["id"]: request for request in requests}
        offers = await db.pharmacy_offers.find({"pharmacy_id": pharmacy_id}, {"_id": 0}).to_list(100)
        offer_by_request = {offer["request_id"]: offer for offer in offers}
        reviews = await db.prescription_reviews.find({"pharmacy_id": pharmacy_id}, {"_id": 0}).to_list(100)
        review_by_request = {review["request_id"]: review for review in reviews}
        result = []
        for assignment in assignments:
            request = request_by_id.get(assignment["request_id"])
            if not request:
                continue
            result.append({**request, "assignment_id": assignment["id"], "assignment_status": assignment["status"], "distance_km": assignment["distance_km"], "prescription_review": review_by_request.get(request["id"]), "offer": offer_by_request.get(request["id"])})
        return result

    async def require_assigned_request(request_id: str, pharmacist: dict) -> tuple[dict, dict]:
        pharmacy_id = pharmacist["pharmacy"]["id"]
        assignment = await db.pharmacy_request_assignments.find_one({"request_id": request_id, "pharmacy_id": pharmacy_id})
        request = await db.medicine_requests.find_one({"id": request_id, "status": {"$in": ["collecting_offers", "order_placed"]}}, {"_id": 0, "address": 0, "latitude": 0, "longitude": 0})
        if not assignment or not request:
            raise HTTPException(status_code=404, detail="Request is not assigned to this pharmacy")
        return assignment, request

    @router.get("/pharmacist/requests/{request_id}/prescription")
    async def get_assigned_prescription(request_id: str, pharmacist: dict = Depends(current_pharmacist)) -> dict:
        assignment, request = await require_assigned_request(request_id, pharmacist)
        if not request.get("prescription_id") or not request.get("prescription_share_consent"):
            raise HTTPException(status_code=404, detail="No prescription was shared for this request")
        prescription = await db.prescriptions.find_one({"id": request["prescription_id"], "user_id": request.get("user_id")}, {"_id": 0})
        if not prescription:
            raise HTTPException(status_code=404, detail="Prescription is no longer available")
        await db.prescription_access_log.insert_one({"id": f"rx-access-{uuid.uuid4().hex[:10]}", "request_id": request_id, "assignment_id": assignment["id"], "pharmacy_id": pharmacist["pharmacy"]["id"], "pharmacist_id": pharmacist["account"]["id"], "accessed_at": now_iso()})
        return {"id": prescription["id"], "filename": prescription.get("filename", "prescription"), "content_type": prescription.get("content_type", "application/octet-stream"), "data_base64": prescription.get("data", "")}

    @router.post("/pharmacist/requests/{request_id}/prescription-review")
    async def review_assigned_prescription(request_id: str, payload: PrescriptionReviewInput, pharmacist: dict = Depends(current_pharmacist)) -> dict:
        assignment, request = await require_assigned_request(request_id, pharmacist)
        if not request.get("prescription_id") or not request.get("prescription_share_consent"):
            raise HTTPException(status_code=404, detail="No prescription was shared for this request")
        if request.get("status") != "collecting_offers":
            raise HTTPException(status_code=409, detail="This request is no longer accepting a prescription review")
        pharmacy_id = pharmacist["pharmacy"]["id"]
        review = {
            "request_id": request_id,
            "pharmacy_id": pharmacy_id,
            "pharmacist_id": pharmacist["account"]["id"],
            "decision": payload.decision,
            "reason": payload.reason,
            "updated_at": now_iso(),
        }
        await db.prescription_reviews.update_one(
            {"request_id": request_id, "pharmacy_id": pharmacy_id},
            {"$set": review, "$setOnInsert": {"id": f"rx-review-{uuid.uuid4().hex[:10]}", "created_at": now_iso()}},
            upsert=True,
        )
        assignment_status = {"matches": "reviewing", "clarification": "needs_clarification", "not-approved": "not_approved"}[payload.decision]
        await db.pharmacy_request_assignments.update_one({"id": assignment["id"]}, {"$set": {"status": assignment_status, "reviewed_at": now_iso()}})
        return {"request_id": request_id, "decision": payload.decision, "reason": payload.reason, "updated_at": review["updated_at"]}

    @router.post("/pharmacist/requests/{request_id}/offer")
    async def create_pharmacist_offer(request_id: str, payload: PharmacistOffer, pharmacist: dict = Depends(current_pharmacist)) -> dict:
        assignment, request = await require_assigned_request(request_id, pharmacist)
        if request.get("expires_at") and datetime.fromisoformat(request["expires_at"]) <= datetime.now(timezone.utc):
            await db.medicine_requests.update_one({"id": request_id, "status": "collecting_offers"}, {"$set": {"status": "expired"}})
            await db.pharmacy_request_assignments.update_many({"request_id": request_id, "status": {"$in": ["invited", "reviewing"]}}, {"$set": {"status": "expired", "closed_at": now_iso()}})
            raise HTTPException(status_code=409, detail="This request has expired")
        can_close_after_review = payload.availability == "unavailable" and assignment.get("status") in {"needs_clarification", "not_approved"}
        if request.get("status") != "collecting_offers" or (assignment.get("status") not in {"invited", "reviewing"} and not can_close_after_review):
            raise HTTPException(status_code=409, detail="This request is no longer accepting a response")
        if await db.pharmacy_offers.find_one({"request_id": request_id, "pharmacy_id": pharmacist["pharmacy"]["id"]}):
            raise HTTPException(status_code=409, detail="Your pharmacy has already responded to this request")
        saved_review = await db.prescription_reviews.find_one({"request_id": request_id, "pharmacy_id": pharmacist["pharmacy"]["id"]}, {"_id": 0})
        prescription_decision = payload.prescription_decision or (saved_review.get("decision") if saved_review else None)
        if request.get("prescription_id") and prescription_decision is None:
            raise HTTPException(status_code=422, detail="Record a prescription decision before responding")
        if request.get("prescription_id") and payload.availability != "unavailable" and prescription_decision != "matches":
            raise HTTPException(status_code=422, detail="Only a matching prescription can receive an offer")
        if payload.availability == "unavailable" and payload.items:
            raise HTTPException(status_code=422, detail="An unavailable response cannot include medicines")
        if payload.availability != "unavailable" and not payload.items:
            raise HTTPException(status_code=422, detail="Add at least one medicine to the offer")

        requested_by_id = {item["medicine_id"]: item for item in request.get("items", []) if item.get("medicine_id")}
        requested_by_name = {item["requested_name"].strip().casefold(): item for item in request.get("items", []) if item.get("requested_name")}
        if any(bool(item.medicine_id) == bool(item.requested_name) for item in payload.items):
            raise HTTPException(status_code=422, detail="Each offer line needs either a catalog medicine or a matching customer-entered name")
        offer_ids = [item.medicine_id for item in payload.items if item.medicine_id]
        offered_custom_names = [item.requested_name.strip().casefold() for item in payload.items if item.requested_name]
        if len(set(offer_ids)) != len(offer_ids) or len(set(offered_custom_names)) != len(offered_custom_names):
            raise HTTPException(status_code=422, detail="A medicine can only appear once in an offer")
        for item in payload.items:
            requested = requested_by_id.get(item.medicine_id) if item.medicine_id else requested_by_name.get(item.requested_name.strip().casefold())
            if requested and requested["quantity"] != item.quantity:
                raise HTTPException(status_code=422, detail="Offer quantities must match the customer's request")
        product_ids = list(set(offer_ids))
        products = await db.medicines.find({"id": {"$in": product_ids}}, {"_id": 0}).to_list(100) if product_ids else []
        product_by_id = {product["id"]: product for product in products}
        if len(product_by_id) != len(product_ids):
            raise HTTPException(status_code=422, detail="An offer product is not in the shared catalog")
        pharmacy_id = pharmacist["pharmacy"]["id"]
        carry_entries = await db.pharmacy_carry_list.find({"pharmacy_id": pharmacy_id, "medicine_id": {"$in": product_ids}, "carried": True}, {"_id": 0}).to_list(100) if product_ids else []
        carry_by_id = {entry["medicine_id"]: entry for entry in carry_entries}
        if len(carry_by_id) != len(product_ids):
            raise HTTPException(status_code=422, detail="Offer only medicines on your pharmacy carry list")
        for medicine_id, entry in carry_by_id.items():
            maximum_price = float(product_by_id[medicine_id].get("mrp", product_by_id[medicine_id].get("price", 0)))
            if entry["price"] > maximum_price:
                raise HTTPException(status_code=409, detail="Update a pharmacy price that exceeds the catalog maximum retail price")
        product_names = {product["name"].strip().casefold() for product in product_by_id.values()}
        if payload.availability == "available":
            if not set(requested_by_id).issubset(set(offer_ids)) or not set(requested_by_name).issubset(set(offered_custom_names) | product_names):
                raise HTTPException(status_code=422, detail="A full offer must include every requested medicine")

        offer_items = []
        for item in payload.items:
            if item.medicine_id:
                product = product_by_id[item.medicine_id]
                unit_price = carry_by_id[item.medicine_id]["price"]
                offer_items.append({"medicine_id": item.medicine_id, "requested_name": None, "name": product["name"], "pack": product.get("pack", ""), "quantity": item.quantity, "unit_price": unit_price, "total": round(item.quantity * unit_price, 2)})
            else:
                requested_name = item.requested_name.strip()
                if requested_name.casefold() not in requested_by_name or item.unit_price is None:
                    raise HTTPException(status_code=422, detail="Custom offers must match a customer-entered medicine and include a price")
                offer_items.append({"medicine_id": None, "requested_name": requested_name, "name": requested_name, "pack": "Pharmacist confirmed", "quantity": item.quantity, "unit_price": item.unit_price, "total": round(item.quantity * item.unit_price, 2)})
        subtotal = round(sum(item["total"] for item in offer_items), 2)
        delivery_fee = 0 if subtotal >= 299 else 29
        status = "offered" if payload.availability != "unavailable" else "unavailable"
        offer = {
            "id": f"offer-{uuid.uuid4().hex[:12]}", "request_id": request_id, "pharmacy_id": pharmacy_id,
            "availability": payload.availability, "prescription_decision": prescription_decision,
            "items": offer_items, "subtotal": subtotal, "delivery_fee": delivery_fee,
            "total": round(subtotal + delivery_fee, 2), "eta_minutes": payload.eta_minutes,
            "note": payload.note, "status": status, "created_at": now_iso(),
            "expires_at": min(request.get("expires_at", ""), (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()),
        }
        await db.pharmacy_offers.insert_one(offer)
        assignment_status = "offered" if status == "offered" else ("not_approved" if prescription_decision == "not-approved" else "needs_clarification" if prescription_decision == "clarification" else "unavailable")
        await db.pharmacy_request_assignments.update_one({"id": assignment["id"]}, {"$set": {"status": assignment_status, "responded_at": now_iso()}})
        if request.get("prescription_id"):
            await db.prescription_reviews.update_one({"request_id": request_id, "pharmacy_id": pharmacy_id}, {"$set": {"decision": prescription_decision, "offer_id": offer["id"], "pharmacist_id": pharmacist["account"]["id"], "updated_at": now_iso()}}, upsert=True)
        return {key: value for key, value in offer.items() if key != "_id"}

    @router.get("/pharmacist/orders")
    async def list_pharmacist_orders(pharmacist: dict = Depends(current_pharmacist)) -> list:
        orders = await db.orders.find({"pharmacy_id": pharmacist["pharmacy"]["id"], "offer_id": {"$exists": True}}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(100)
        return orders

    @router.patch("/pharmacist/orders/{order_id}/status")
    async def update_pharmacist_order_status(order_id: str, payload: OrderStatusUpdate, pharmacist: dict = Depends(current_pharmacist)) -> dict:
        order = await db.orders.find_one({"id": order_id, "pharmacy_id": pharmacist["pharmacy"]["id"], "offer_id": {"$exists": True}}, {"_id": 0})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found for this pharmacy")
        transitions = {"Pharmacy Confirmed": {"Preparing"}, "Preparing": {"Out for Delivery", "Delivered"}, "Out for Delivery": {"Delivered"}, "Delivered": set()}
        if payload.status not in transitions.get(order["status"], set()):
            raise HTTPException(status_code=409, detail=f"Cannot move order from {order['status']} to {payload.status}")
        timeline = order.get("timeline", []) + [payload.status]
        await db.orders.update_one({"id": order_id}, {"$set": {"status": payload.status, "timeline": timeline, "updated_at": now_iso()}})
        return {"id": order_id, "status": payload.status, "timeline": timeline}

    @router.post("/medicine-requests/{request_id}/select-offer")
    async def select_offer(request_id: str, payload: SelectOfferInput, user: dict = Depends(customer_dependency)) -> dict:
        request_doc = await db.medicine_requests.find_one({"id": request_id, "user_id": user["id"]}, {"_id": 0})
        if not request_doc:
            raise HTTPException(status_code=404, detail="Request not found")
        offer_id = payload.offer_id
        selected_id = request_doc.get("selected_offer_id")
        if selected_id:
            existing = await db.orders.find_one({"offer_id": selected_id}, {"_id": 0, "user_id": 0})
            if selected_id == offer_id and existing:
                return existing
            raise HTTPException(status_code=409, detail="Another offer was already selected")
        offer = await db.pharmacy_offers.find_one({"id": offer_id, "request_id": request_id, "status": "offered"}, {"_id": 0})
        if not offer or offer["availability"] not in {"available", "partial"}:
            raise HTTPException(status_code=404, detail="Offer is not available")
        if request_doc.get("prescription_id") and offer.get("prescription_decision") != "matches":
            raise HTTPException(status_code=409, detail="This offer has not passed pharmacist prescription review")
        if datetime.fromisoformat(offer["expires_at"]) <= datetime.now(timezone.utc):
            raise HTTPException(status_code=409, detail="This offer has expired")
        claim = await db.medicine_requests.update_one({"id": request_id, "user_id": user["id"], "status": "collecting_offers", "selected_offer_id": None}, {"$set": {"status": "selecting_offer", "selected_offer_id": offer_id}})
        if claim.modified_count != 1:
            raise HTTPException(status_code=409, detail="This request is no longer accepting offer selection")
        pharmacy = await db.pharmacies.find_one({"id": offer["pharmacy_id"]}, {"_id": 0})
        document = {
            "id": f"order-{uuid.uuid4().hex[:12]}", "offer_id": offer_id, "request_id": request_id,
            "user_id": user["id"], "order_number": f"JL{datetime.now(timezone.utc).strftime('%y%m%d')}{uuid.uuid4().hex[:3].upper()}",
            "pharmacy_id": offer["pharmacy_id"], "pharmacy_name": pharmacy.get("name", "Local pharmacy") if pharmacy else "Local pharmacy",
            "items": [{"medicine_id": item["medicine_id"], "name": item["name"], "quantity": item["quantity"], "price": item["unit_price"]} for item in offer["items"]],
            "address": request_doc["address"], "delivery_method": "delivery", "subtotal": offer["subtotal"],
            "discount": 0, "delivery_fee": offer["delivery_fee"], "total": offer["total"],
            "for_profile_id": request_doc.get("for_profile_id"), "for_profile_name": request_doc.get("for_profile_name"),
            "payment_method": payload.payment_method, "payment_status": "pending", "status": "Pharmacy Confirmed",
            "created_at": now_iso(), "eta": f"{offer['eta_minutes']} min", "timeline": ["Request submitted", "Offer selected", "Pharmacy Confirmed"],
        }
        try:
            await db.orders.insert_one(document)
        except Exception:
            await db.medicine_requests.update_one({"id": request_id, "selected_offer_id": offer_id}, {"$set": {"status": "collecting_offers"}, "$unset": {"selected_offer_id": ""}})
            raise
        await db.medicine_requests.update_one({"id": request_id}, {"$set": {"status": "order_placed", "order_id": document["id"], "selected_at": now_iso()}})
        await db.pharmacy_offers.update_one({"id": offer_id}, {"$set": {"status": "selected", "selected_at": now_iso()}})
        await db.pharmacy_request_assignments.update_many({"request_id": request_id, "pharmacy_id": {"$ne": offer["pharmacy_id"]}, "status": {"$in": ["invited", "reviewing", "offered"]}}, {"$set": {"status": "closed", "closed_at": now_iso()}})
        prescription_products = await db.medicines.find({"id": {"$in": [item["medicine_id"] for item in document["items"]]}, "prescription_required": True}, {"_id": 0}).to_list(100)
        prescription_product_ids = {product["id"] for product in prescription_products}
        for item in document["items"]:
            if item["medicine_id"] not in prescription_product_ids:
                continue
            due = datetime.now(timezone.utc) + timedelta(days=30)
            await db.refills.update_one(
                {"user_id": user["id"], "last_order_id": document["id"], "medicine_id": item["medicine_id"]},
                {"$setOnInsert": {
                    "id": f"refill-{uuid.uuid4().hex[:10]}", "user_id": user["id"],
                    "medicine_id": item["medicine_id"], "medicine_name": item["name"], "quantity": item["quantity"], "price": item["price"],
                    "pharmacy_id": offer["pharmacy_id"], "pharmacy_name": document["pharmacy_name"],
                    "for_profile_id": document.get("for_profile_id"), "for_profile_name": document.get("for_profile_name"),
                    "last_order_id": document["id"], "next_refill_at": due.isoformat(), "status": "upcoming", "created_at": now_iso(),
                }},
                upsert=True,
            )
        return {key: value for key, value in document.items() if key not in {"_id", "user_id"}}

    return router
