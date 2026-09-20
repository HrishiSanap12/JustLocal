"""Tests for new endpoints added in this iteration: Apple, Emergent-Google session, Razorpay."""
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL", "https://mobile-release-66.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@justlocal.app"
DEMO_PASSWORD = "Justlocal123!"


@pytest.fixture(scope="session")
def demo_token():
    r = requests.post(
        f"{API}/auth/login",
        json={"identifier": DEMO_EMAIL, "password": DEMO_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def mongo_db():
    url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    name = os.environ.get("DB_NAME", "justlocal")
    client = MongoClient(url)
    yield client[name]
    client.close()


# --- Razorpay ---
class TestRazorpay:
    def test_config_placeholder(self):
        r = requests.get(f"{API}/payments/razorpay/config", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body == {"ready": False, "key_id": ""}, body

    def test_order_returns_503_when_not_configured(self, demo_token):
        r = requests.post(
            f"{API}/payments/razorpay/order",
            json={"order_id": "order-demo-1"},
            headers={"Authorization": f"Bearer {demo_token}"},
            timeout=15,
        )
        assert r.status_code == 503, r.text
        detail = r.json().get("detail", "").lower()
        assert "razorpay" in detail or "not enabled" in detail

    def test_order_requires_auth(self):
        r = requests.post(
            f"{API}/payments/razorpay/order",
            json={"order_id": "order-demo-1"},
            timeout=10,
        )
        assert r.status_code == 401


# --- Apple Sign-In ---
class TestApple:
    def test_invalid_identity_token_returns_401(self):
        r = requests.post(
            f"{API}/auth/apple",
            json={"identity_token": "not.a.real.token", "email": "x@x.com"},
            timeout=15,
        )
        # must NOT be 500 - either 401 (invalid) or 500 only if not configured
        assert r.status_code == 401, f"expected 401 got {r.status_code}: {r.text}"

    def test_gibberish_token_returns_401(self):
        r = requests.post(
            f"{API}/auth/apple",
            json={"identity_token": "garbage"},
            timeout=15,
        )
        assert r.status_code == 401, r.text


# --- Emergent-managed Google session ---
class TestEmergentSession:
    def test_bogus_session_id_returns_401(self):
        r = requests.post(
            f"{API}/auth/session",
            json={"session_id": "TEST-bogus-session-id-does-not-exist-123"},
            timeout=20,
        )
        assert r.status_code == 401, f"expected 401 got {r.status_code}: {r.text}"


# --- Session-token based current_user ---
class TestSessionTokenAuth:
    def test_me_accepts_session_token(self, mongo_db):
        # Seed a fake session_token pointing at the demo user
        token = f"TEST-session-{datetime.now(timezone.utc).timestamp()}"
        mongo_db.user_sessions.update_one(
            {"session_token": token},
            {
                "$set": {
                    "session_token": token,
                    "user_id": "user-demo",
                    "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
                    "created_at": datetime.now(timezone.utc),
                }
            },
            upsert=True,
        )
        try:
            r = requests.get(
                f"{API}/me",
                headers={"Authorization": f"Bearer {token}"},
                timeout=10,
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["email"] == DEMO_EMAIL
            assert data["id"] == "user-demo"
        finally:
            mongo_db.user_sessions.delete_one({"session_token": token})

    def test_me_rejects_expired_session_token(self, mongo_db):
        token = f"TEST-expired-{datetime.now(timezone.utc).timestamp()}"
        mongo_db.user_sessions.update_one(
            {"session_token": token},
            {
                "$set": {
                    "session_token": token,
                    "user_id": "user-demo",
                    "expires_at": datetime.now(timezone.utc) - timedelta(hours=1),
                    "created_at": datetime.now(timezone.utc),
                }
            },
            upsert=True,
        )
        try:
            r = requests.get(
                f"{API}/me",
                headers={"Authorization": f"Bearer {token}"},
                timeout=10,
            )
            assert r.status_code == 401
        finally:
            mongo_db.user_sessions.delete_one({"session_token": token})

    def test_me_rejects_unknown_bearer(self):
        r = requests.get(
            f"{API}/me",
            headers={"Authorization": "Bearer totally-unknown-token"},
            timeout=10,
        )
        assert r.status_code == 401
