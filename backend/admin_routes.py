"""Admin dashboard API: platform metrics, API performance and pharmacy management.

All routes require the X-Pharmacy-Admin-Token header. Metrics are aggregates only;
no customer names, emails or addresses are returned.
"""
from __future__ import annotations

import hmac
import os
import time
from collections import Counter, defaultdict, deque
from datetime import datetime, timedelta, timezone
from statistics import mean
from typing import Any, Literal, Optional

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from email_otp import dev_mode, email_provider


class RequestStats:
    """In-memory record of recent API calls (resets when the server restarts)."""

    def __init__(self, size: int = 20000) -> None:
        self.started = time.time()
        self.samples: deque[tuple[float, str, int, float]] = deque(maxlen=size)

    def record(self, route: str, status: int, duration_ms: float) -> None:
        self.samples.append((time.time(), route, status, duration_ms))

    async def middleware(self, request: Request, call_next):
        start = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            return response
        finally:
            route = request.scope.get("route")
            path = getattr(route, "path", None) or "unmatched"
            if path.startswith("/api") and "/admin/" not in path:
                self.record(f"{request.method} {path}", status, (time.perf_counter() - start) * 1000)


def _percentile(values: list[float], pct: float) -> Optional[float]:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round(pct / 100 * (len(ordered) - 1))))
    return round(ordered[index], 1)


def _parse(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return None


def build_admin_router(db, now_iso, stats: RequestStats) -> APIRouter:
    router = APIRouter(prefix="/api/admin")

    class ModerationInput(BaseModel):
        reason: Optional[str] = Field(default=None, max_length=300)

    def require_admin(token: Optional[str]) -> None:
        expected = os.environ.get("PHARMACY_ADMIN_TOKEN", "")
        if not expected:
            raise HTTPException(status_code=503, detail="Pharmacy verification is not configured")
        if not token or not hmac.compare_digest(token, expected):
            raise HTTPException(status_code=401, detail="Admin verification required")

    @router.get("/metrics")
    async def metrics(days: int = 14, x_pharmacy_admin_token: Optional[str] = Header(default=None)) -> dict:
        require_admin(x_pharmacy_admin_token)
        days = max(7, min(days, 60))
        now = datetime.now(timezone.utc)
        window_start = (now - timedelta(days=days - 1)).date()
        day_keys = [(window_start + timedelta(days=offset)).isoformat() for offset in range(days)]

        def in_days(value: Any, span: int) -> bool:
            moment = _parse(value)
            return bool(moment and moment >= now - timedelta(days=span))

        users = await db.users.find({}, {"_id": 0, "id": 1, "created_at": 1, "email_verified": 1, "apple_sub": 1, "password_hash": 1}).to_list(50000)
        pharmacies = await db.pharmacies.find({}, {"_id": 0, "id": 1, "name": 1, "verification_status": 1, "accepting_requests": 1, "created_at": 1}).to_list(5000)
        requests = await db.medicine_requests.find({}, {"_id": 0, "id": 1, "user_id": 1, "status": 1, "created_at": 1, "items": 1, "prescription_id": 1, "matched_pharmacy_count": 1}).to_list(50000)
        offers = await db.pharmacy_offers.find({}, {"_id": 0, "request_id": 1, "pharmacy_id": 1, "status": 1, "availability": 1, "created_at": 1}).to_list(100000)
        orders = await db.orders.find({}, {"_id": 0, "user_id": 1, "pharmacy_id": 1, "pharmacy_name": 1, "status": 1, "total": 1, "created_at": 1, "offer_id": 1}).to_list(50000)

        # Users
        sign_in_methods = Counter("apple" if user.get("apple_sub") else "email" if user.get("password_hash") else "google" for user in users)
        user_section = {
            "total": len(users),
            "email_verified": sum(1 for user in users if user.get("email_verified", True)),
            "new_7d": sum(1 for user in users if in_days(user.get("created_at"), 7)),
            "new_30d": sum(1 for user in users if in_days(user.get("created_at"), 30)),
            "active_7d": len({request.get("user_id") for request in requests if in_days(request.get("created_at"), 7)}),
            "ordering_customers": len({order.get("user_id") for order in orders if order.get("user_id")}),
            "sign_in_methods": dict(sign_in_methods),
        }

        # Pharmacies
        pharmacy_status = Counter(pharmacy.get("verification_status", "unknown") for pharmacy in pharmacies)
        pharmacy_section = {
            "total": len(pharmacies),
            "verified": pharmacy_status.get("verified", 0),
            "pending": pharmacy_status.get("pending", 0),
            "rejected": pharmacy_status.get("rejected", 0),
            "suspended": pharmacy_status.get("suspended", 0),
            "accepting": sum(1 for pharmacy in pharmacies if pharmacy.get("verification_status") == "verified" and pharmacy.get("accepting_requests")),
        }

        # Requests, offers, response time
        first_offer: dict[str, datetime] = {}
        offers_by_request: dict[str, int] = defaultdict(int)
        for offer in offers:
            created = _parse(offer.get("created_at"))
            request_id = offer.get("request_id")
            if not created or not request_id:
                continue
            offers_by_request[request_id] += 1
            if request_id not in first_offer or created < first_offer[request_id]:
                first_offer[request_id] = created
        response_minutes = []
        for request in requests:
            created = _parse(request.get("created_at"))
            if created and request["id"] in first_offer:
                response_minutes.append(max(0.0, (first_offer[request["id"]] - created).total_seconds() / 60))
        routed = [request for request in requests if (request.get("matched_pharmacy_count") or 0) > 0]
        request_section = {
            "total": len(requests),
            "last_7d": sum(1 for request in requests if in_days(request.get("created_at"), 7)),
            "by_status": dict(Counter(request.get("status", "unknown") for request in requests)),
            "with_prescription": sum(1 for request in requests if request.get("prescription_id")),
            "with_offers": sum(1 for request in requests if request["id"] in first_offer),
            "avg_pharmacies_matched": round(mean([request.get("matched_pharmacy_count") or 0 for request in requests]), 1) if requests else 0,
            "response_rate": round(100 * sum(1 for request in routed if request["id"] in first_offer) / len(routed), 1) if routed else None,
            "median_first_offer_minutes": _percentile(response_minutes, 50),
            "p90_first_offer_minutes": _percentile(response_minutes, 90),
        }
        offer_section = {
            "total": len(offers),
            "available": sum(1 for offer in offers if offer.get("availability") == "available"),
            "partial": sum(1 for offer in offers if offer.get("availability") == "partial"),
            "unavailable": sum(1 for offer in offers if offer.get("availability") == "unavailable"),
            "selected": sum(1 for offer in offers if offer.get("status") == "selected"),
        }

        # Orders and revenue (offer-based orders only; demo orders have no offer_id)
        real_orders = [order for order in orders if order.get("offer_id")]
        totals = [float(order.get("total") or 0) for order in real_orders]
        order_section = {
            "total": len(real_orders),
            "by_status": dict(Counter(order.get("status", "unknown") for order in real_orders)),
            "gross_value": round(sum(totals), 2),
            "avg_order_value": round(mean(totals), 2) if totals else 0,
            "conversion_rate": round(100 * len(real_orders) / len(requests), 1) if requests else None,
            "delivered": sum(1 for order in real_orders if order.get("status") == "Delivered"),
        }

        # Daily series
        daily: dict[str, dict[str, int]] = {key: {"requests": 0, "orders": 0, "signups": 0} for key in day_keys}
        for request in requests:
            moment = _parse(request.get("created_at"))
            if moment and moment.date().isoformat() in daily:
                daily[moment.date().isoformat()]["requests"] += 1
        for order in real_orders:
            moment = _parse(order.get("created_at"))
            if moment and moment.date().isoformat() in daily:
                daily[moment.date().isoformat()]["orders"] += 1
        for user in users:
            moment = _parse(user.get("created_at"))
            if moment and moment.date().isoformat() in daily:
                daily[moment.date().isoformat()]["signups"] += 1

        # Leaderboards
        medicine_counts: Counter[str] = Counter()
        for request in requests:
            for item in request.get("items") or []:
                if item.get("name"):
                    medicine_counts[item["name"]] += int(item.get("quantity") or 1)
        pharmacy_names = {pharmacy["id"]: pharmacy.get("name", "Pharmacy") for pharmacy in pharmacies}
        pharmacy_orders: dict[str, dict[str, float]] = defaultdict(lambda: {"orders": 0, "value": 0.0})
        for order in real_orders:
            entry = pharmacy_orders[order.get("pharmacy_id", "")]
            entry["orders"] += 1
            entry["value"] += float(order.get("total") or 0)
        pharmacy_offers = Counter(offer.get("pharmacy_id") for offer in offers if offer.get("status") in {"offered", "selected"})
        top_pharmacies = sorted(
            ({"id": pid, "name": pharmacy_names.get(pid, "Pharmacy"), "orders": int(value["orders"]), "value": round(value["value"], 2), "offers": pharmacy_offers.get(pid, 0)} for pid, value in pharmacy_orders.items() if pid),
            key=lambda row: (-row["orders"], -row["value"]),
        )[:6]

        # API performance
        cutoff = time.time() - 24 * 3600
        recent = [sample for sample in stats.samples if sample[0] >= cutoff]
        durations = [sample[3] for sample in recent]
        by_route: dict[str, list[tuple[int, float]]] = defaultdict(list)
        for _ts, route, status, duration in recent:
            by_route[route].append((status, duration))
        endpoints = sorted(
            (
                {
                    "route": route,
                    "calls": len(rows),
                    "p50_ms": _percentile([duration for _status, duration in rows], 50),
                    "p95_ms": _percentile([duration for _status, duration in rows], 95),
                    "error_rate": round(100 * sum(1 for status, _d in rows if status >= 500) / len(rows), 1),
                }
                for route, rows in by_route.items()
            ),
            key=lambda row: -row["calls"],
        )[:10]
        hourly: dict[int, list[float]] = defaultdict(list)
        for ts, _route, _status, duration in recent:
            hourly[int((ts - cutoff) // 3600)].append(duration)
        db_ping_start = time.perf_counter()
        try:
            await db.command("ping")
            db_ping = round((time.perf_counter() - db_ping_start) * 1000, 1)
        except Exception:  # noqa: BLE001 - report as unavailable
            db_ping = None
        from server import ocr_provider  # local import avoids a circular import at startup

        system_section = {
            "uptime_seconds": int(time.time() - stats.started),
            "requests_24h": len(recent),
            "p50_ms": _percentile(durations, 50),
            "p95_ms": _percentile(durations, 95),
            "p99_ms": _percentile(durations, 99),
            "server_error_rate": round(100 * sum(1 for sample in recent if sample[2] >= 500) / len(recent), 2) if recent else 0,
            "client_error_rate": round(100 * sum(1 for sample in recent if 400 <= sample[2] < 500) / len(recent), 2) if recent else 0,
            "db_ping_ms": db_ping,
            "email_provider": email_provider() or "none",
            "email_dev_mode": dev_mode(),
            "ocr_provider": ocr_provider(),
            "catalog_size": await db.medicines.estimated_document_count(),
            "endpoints": endpoints,
            "latency_by_hour": [
                {"hour": hour, "calls": len(hourly.get(hour, [])), "p95_ms": _percentile(hourly.get(hour, []), 95)} for hour in range(24)
            ],
        }

        return {
            "generated_at": now_iso(),
            "window_days": days,
            "users": user_section,
            "pharmacies": pharmacy_section,
            "requests": request_section,
            "offers": offer_section,
            "orders": order_section,
            "daily": [{"date": key, **daily[key]} for key in day_keys],
            "top_medicines": [{"name": name, "quantity": count} for name, count in medicine_counts.most_common(8)],
            "top_pharmacies": top_pharmacies,
            "system": system_section,
        }

    @router.get("/pharmacies")
    async def list_pharmacies(status: Optional[str] = None, x_pharmacy_admin_token: Optional[str] = Header(default=None)) -> list:
        require_admin(x_pharmacy_admin_token)
        query: dict = {"verification_status": status} if status and status != "all" else {}
        pharmacies = await db.pharmacies.find(query, {"_id": 0, "geo_location": 0}).sort("created_at", -1).to_list(2000)
        ids = [pharmacy["id"] for pharmacy in pharmacies]
        accounts = await db.pharmacist_accounts.find({"pharmacy_id": {"$in": ids}}, {"_id": 0, "password_hash": 0}).to_list(5000)
        account_by_pharmacy = {account["pharmacy_id"]: account for account in accounts}
        order_counts = Counter(order["pharmacy_id"] for order in await db.orders.find({"pharmacy_id": {"$in": ids}, "offer_id": {"$exists": True}}, {"_id": 0, "pharmacy_id": 1}).to_list(50000))
        carry_counts = Counter(entry["pharmacy_id"] for entry in await db.pharmacy_carry_list.find({"pharmacy_id": {"$in": ids}, "carried": True}, {"_id": 0, "pharmacy_id": 1}).to_list(100000))
        result = []
        for pharmacy in pharmacies:
            account = account_by_pharmacy.get(pharmacy["id"])
            result.append({
                **pharmacy,
                "orders": order_counts.get(pharmacy["id"], 0),
                "carried_medicines": carry_counts.get(pharmacy["id"], 0),
                "pharmacist": {key: account.get(key) for key in ("id", "name", "email", "phone", "status")} | {"email_verified": account.get("email_verified", True)} if account else None,
            })
        return result

    async def set_status(pharmacy_id: str, allowed_from: set[str], status: Literal["rejected", "suspended", "verified"], reason: Optional[str]) -> dict:
        pharmacy = await db.pharmacies.find_one({"id": pharmacy_id}, {"_id": 0})
        if not pharmacy:
            raise HTTPException(status_code=404, detail="Pharmacy not found")
        if pharmacy.get("verification_status") not in allowed_from:
            raise HTTPException(status_code=409, detail=f"Pharmacy is {pharmacy.get('verification_status')}, so it can't be moved to {status}")
        update: dict = {"verification_status": status, "moderated_at": now_iso(), "moderation_reason": reason}
        if status != "verified":
            update["accepting_requests"] = False
        await db.pharmacies.update_one({"id": pharmacy_id}, {"$set": update})
        account_status = {"rejected": "rejected", "suspended": "verified", "verified": "verified"}[status]
        accounts = await db.pharmacist_accounts.find({"pharmacy_id": pharmacy_id}, {"_id": 0, "id": 1}).to_list(50)
        await db.pharmacist_accounts.update_many({"pharmacy_id": pharmacy_id}, {"$set": {"status": account_status}})
        if status != "verified" and accounts:
            # End any open pharmacist sessions immediately.
            await db.pharmacist_sessions.delete_many({"account_id": {"$in": [account["id"] for account in accounts]}})
        return {"pharmacy_id": pharmacy_id, "status": status}

    @router.post("/pharmacies/{pharmacy_id}/reject")
    async def reject_pharmacy(pharmacy_id: str, payload: ModerationInput, x_pharmacy_admin_token: Optional[str] = Header(default=None)) -> dict:
        require_admin(x_pharmacy_admin_token)
        return await set_status(pharmacy_id, {"pending"}, "rejected", payload.reason)

    @router.post("/pharmacies/{pharmacy_id}/suspend")
    async def suspend_pharmacy(pharmacy_id: str, payload: ModerationInput, x_pharmacy_admin_token: Optional[str] = Header(default=None)) -> dict:
        require_admin(x_pharmacy_admin_token)
        return await set_status(pharmacy_id, {"verified"}, "suspended", payload.reason)

    @router.post("/pharmacies/{pharmacy_id}/reinstate")
    async def reinstate_pharmacy(pharmacy_id: str, x_pharmacy_admin_token: Optional[str] = Header(default=None)) -> dict:
        require_admin(x_pharmacy_admin_token)
        return await set_status(pharmacy_id, {"suspended"}, "verified", None)

    return router
