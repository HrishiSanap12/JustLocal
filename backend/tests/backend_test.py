"""Backend API tests for Justlocal MVP."""
import io
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://mobile-release-66.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@justlocal.app"
DEMO_PASSWORD = "Justlocal123!"


@pytest.fixture(scope="session")
def demo_token():
    r = requests.post(f"{API}/auth/login", json={"identifier": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def new_user_token():
    email = f"test_{uuid.uuid4().hex[:8]}@justlocal.test"
    r = requests.post(f"{API}/auth/register", json={"name": "TEST User", "email": email, "phone": "+911111111111", "password": "TestPass123!"}, timeout=15)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    body = r.json()
    return body["token"], body["user"], email


# --- Health ---
class TestHealth:
    def test_root(self):
        r = requests.get(f"{API}/", timeout=10)
        assert r.status_code == 200
        assert "Justlocal" in r.json().get("message", "")


# --- Auth ---
class TestAuth:
    def test_login_demo(self):
        r = requests.post(f"{API}/auth/login", json={"identifier": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and data["user"]["email"] == DEMO_EMAIL

    def test_login_bad_password(self):
        r = requests.post(f"{API}/auth/login", json={"identifier": DEMO_EMAIL, "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_register_new_user(self, new_user_token):
        token, user, email = new_user_token
        assert token and user["email"] == email

    def test_register_duplicate(self, new_user_token):
        _, _, email = new_user_token
        r = requests.post(f"{API}/auth/register", json={"name": "Dup", "email": email, "phone": "+9100", "password": "Password1!"}, timeout=15)
        assert r.status_code == 409

    def test_register_short_password(self):
        email = f"TEST_{uuid.uuid4().hex[:8]}@justlocal.test"
        r = requests.post(f"{API}/auth/register", json={"name": "X", "email": email, "phone": "+91", "password": "123"}, timeout=15)
        assert r.status_code == 400

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/me", timeout=10)
        assert r.status_code == 401

    def test_me_success(self, demo_token):
        r = requests.get(f"{API}/me", headers={"Authorization": f"Bearer {demo_token}"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["email"] == DEMO_EMAIL


# --- Catalog ---
class TestCatalog:
    def test_categories(self):
        r = requests.get(f"{API}/categories", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        assert "name" in data[0] and "icon" in data[0]

    def test_medicines_all(self):
        r = requests.get(f"{API}/medicines", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) >= 5

    def test_medicines_category_filter(self):
        r = requests.get(f"{API}/medicines", params={"category": "OTC Medicines"}, timeout=10)
        assert r.status_code == 200
        for m in r.json():
            assert m["category"].lower() == "otc medicines"

    def test_medicines_search(self):
        r = requests.get(f"{API}/medicines", params={"search": "Paracetamol"}, timeout=10)
        assert r.status_code == 200
        names = [m["name"].lower() for m in r.json()]
        assert any("paracetamol" in n for n in names)

    def test_pharmacies(self):
        r = requests.get(f"{API}/pharmacies", timeout=10)
        assert r.status_code == 200 and len(r.json()) >= 1

    def test_offers(self):
        r = requests.get(f"{API}/offers", timeout=10)
        assert r.status_code == 200 and len(r.json()) >= 1


# --- Orders ---
class TestOrders:
    def test_orders_requires_auth(self):
        r = requests.get(f"{API}/orders", timeout=10)
        assert r.status_code == 401

    def test_orders_list_demo(self, demo_token):
        r = requests.get(f"{API}/orders", headers={"Authorization": f"Bearer {demo_token}"}, timeout=10)
        assert r.status_code == 200
        orders = r.json()
        assert isinstance(orders, list) and len(orders) >= 1
        # Verify no user_id or _id leaks
        assert "user_id" not in orders[0] and "_id" not in orders[0]

    def test_create_order(self, demo_token):
        payload = {
            "pharmacy_id": "pharmacy-1",
            "items": [{"medicine_id": "med-1", "name": "Paracetamol 500mg", "quantity": 2, "price": 25}],
            "address": "TEST Address, Mumbai",
            "delivery_method": "delivery",
            "subtotal": 50, "discount": 0, "delivery_fee": 0, "total": 50,
        }
        r = requests.post(f"{API}/orders", json=payload, headers={"Authorization": f"Bearer {demo_token}"}, timeout=15)
        assert r.status_code == 409, r.text
        assert "choose a pharmacist offer" in r.json().get("detail", "")


# --- Addresses ---
class TestAddresses:
    def test_add_address_requires_auth(self):
        r = requests.post(f"{API}/addresses", json={"label": "Work", "address": "test"}, timeout=10)
        assert r.status_code == 401

    def test_add_address(self, new_user_token):
        token, _, _ = new_user_token
        r = requests.post(f"{API}/addresses", json={"label": "TEST Work", "address": "Andheri West, Mumbai", "phone": "+919000000000"},
                          headers={"Authorization": f"Bearer {token}"}, timeout=10)
        assert r.status_code == 200
        addr = r.json()
        assert addr["label"] == "TEST Work" and addr["default"] is True

        # verify persisted on /me
        me = requests.get(f"{API}/me", headers={"Authorization": f"Bearer {token}"}, timeout=10).json()
        assert any(a["id"] == addr["id"] for a in me["addresses"])


# --- Prescription upload ---
class TestPrescription:
    def test_upload_requires_auth(self):
        files = {"file": ("test.jpg", b"data", "image/jpeg")}
        r = requests.post(f"{API}/prescriptions", files=files, timeout=15)
        assert r.status_code == 401

    def test_upload_prescription(self, demo_token):
        # Minimal 1x1 png bytes
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
        files = {"file": ("rx.jpg", io.BytesIO(png), "image/jpeg")}
        r = requests.post(f"{API}/prescriptions", files=files, headers={"Authorization": f"Bearer {demo_token}"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "Awaiting pharmacist review"
        assert body["filename"] == "rx.jpg"
