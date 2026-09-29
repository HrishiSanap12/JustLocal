import base64
import os
import re
import uuid

import pytest
import requests
from pymongo import MongoClient


BASE_URL = os.environ.get("JUSTLOCAL_TEST_API_URL", "").rstrip("/")
ADMIN_TOKEN = os.environ.get("PHARMACY_ADMIN_TOKEN", "")
pytestmark = pytest.mark.skipif(not BASE_URL or not ADMIN_TOKEN, reason="Set JUSTLOCAL_TEST_API_URL and PHARMACY_ADMIN_TOKEN for pharmacy integration tests")


@pytest.fixture
def pharmacy_test_data():
    if not os.environ.get("MONGO_URL"):
        pytest.skip("MONGO_URL is required to clean up integration test data")
    suffix = uuid.uuid4().hex[:10]
    client = MongoClient(os.environ["MONGO_URL"])
    database = client[os.environ.get("DB_NAME", "justlocal")]
    try:
        yield suffix
    finally:
        pharmacist = database.pharmacist_accounts.find_one({"email": f"pharmacist-{suffix}@justlocal.test"})
        pharmacy_id = pharmacist.get("pharmacy_id") if pharmacist else None
        customer_requests = list(database.medicine_requests.find({"address": {"$regex": re.escape(f"WORKFLOW-TEST-{suffix}")}}))
        request_ids = [request["id"] for request in customer_requests]
        prescription_ids = [request["prescription_id"] for request in customer_requests if request.get("prescription_id")]
        uploaded = list(database.prescriptions.find({"filename": f"test-prescription-{suffix}.png"}, {"id": 1}))
        prescription_ids.extend(document["id"] for document in uploaded)
        offers = list(database.pharmacy_offers.find({"$or": [{"pharmacy_id": pharmacy_id}, {"request_id": {"$in": request_ids}}]}, {"id": 1})) if pharmacy_id or request_ids else []
        offer_ids = [offer["id"] for offer in offers]
        orders = list(database.orders.find({"$or": [{"pharmacy_id": pharmacy_id}, {"request_id": {"$in": request_ids}}, {"offer_id": {"$in": offer_ids}}]}, {"id": 1})) if pharmacy_id or request_ids or offer_ids else []
        order_ids = [order["id"] for order in orders]
        database.refills.delete_many({"last_order_id": {"$in": order_ids}})
        database.orders.delete_many({"id": {"$in": order_ids}})
        database.pharmacy_offers.delete_many({"id": {"$in": offer_ids}})
        database.pharmacy_request_assignments.delete_many({"request_id": {"$in": request_ids}})
        database.prescription_reviews.delete_many({"request_id": {"$in": request_ids}})
        database.prescription_access_log.delete_many({"request_id": {"$in": request_ids}})
        database.medicine_requests.delete_many({"id": {"$in": request_ids}})
        database.prescriptions.delete_many({"id": {"$in": prescription_ids}})
        if pharmacy_id:
            database.pharmacy_carry_list.delete_many({"pharmacy_id": pharmacy_id})
            database.pharmacist_sessions.delete_many({"account_id": pharmacist["id"]})
            database.pharmacist_accounts.delete_one({"id": pharmacist["id"]})
            database.pharmacies.delete_one({"id": pharmacy_id})
        client.close()


def test_prescription_request_offer_selection_and_order_lifecycle(pharmacy_test_data):
    api = f"{BASE_URL}/api"
    suffix = pharmacy_test_data
    customer = requests.post(
        f"{api}/auth/login",
        json={"identifier": "demo@justlocal.app", "password": "Justlocal123!"},
        timeout=15,
    )
    assert customer.status_code == 200, customer.text
    customer_token = customer.json()["token"]
    customer_headers = {"Authorization": f"Bearer {customer_token}"}

    registration = requests.post(
        f"{api}/pharmacist/auth/register",
        json={
            "name": "Test Pharmacist",
            "email": f"pharmacist-{suffix}@justlocal.test",
            "phone": "+919876543210",
            "password": "TestPharmacist123!",
            "pharmacy_name": f"Test Pharmacy {suffix}",
            "license_number": f"TEST-{suffix}",
            "address": f"WORKFLOW-TEST-{suffix}, 12 Test Road, Indiranagar, Bengaluru",
            "latitude": 12.9784,
            "longitude": 77.6408,
        },
        timeout=15,
    )
    assert registration.status_code == 202, registration.text
    pharmacy_id = registration.json()["pharmacy_id"]

    verified = requests.post(
        f"{api}/admin/pharmacies/{pharmacy_id}/verify",
        headers={"X-Pharmacy-Admin-Token": ADMIN_TOKEN},
        timeout=15,
    )
    assert verified.status_code == 200, verified.text
    login = requests.post(
        f"{api}/pharmacist/auth/login",
        json={"email": f"pharmacist-{suffix}@justlocal.test", "password": "TestPharmacist123!"},
        timeout=15,
    )
    assert login.status_code == 200, login.text
    pharmacist_token = login.json()["token"]
    pharmacist_headers = {"Authorization": f"Bearer {pharmacist_token}"}

    over_mrp = requests.post(
        f"{api}/pharmacist/carry-list",
        headers=pharmacist_headers,
        json={"medicine_id": "med-5", "price": 87, "carried": True},
        timeout=15,
    )
    assert over_mrp.status_code == 422

    carry = requests.post(
        f"{api}/pharmacist/carry-list",
        headers=pharmacist_headers,
        json={"medicine_id": "med-5", "price": 86, "carried": True},
        timeout=15,
    )
    assert carry.status_code == 200, carry.text
    assert "quantity" not in carry.json()

    image = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
    upload = requests.post(
        f"{api}/prescriptions",
        headers=customer_headers,
        files={"file": (f"test-prescription-{suffix}.png", image, "image/png")},
        timeout=15,
    )
    assert upload.status_code == 200, upload.text
    prescription_id = upload.json()["id"]

    missing_consent = requests.post(
        f"{api}/medicine-requests",
        headers=customer_headers,
        json={
            "items": [{"medicine_id": "med-5", "quantity": 2}],
            "prescription_id": prescription_id,
            "prescription_share_consent": False,
            "address": f"WORKFLOW-TEST-{suffix}, 12 Test Road, Indiranagar, Bengaluru",
            "latitude": 12.9784,
            "longitude": 77.6408,
        },
        timeout=15,
    )
    assert missing_consent.status_code == 422

    created = requests.post(
        f"{api}/medicine-requests",
        headers=customer_headers,
        json={
            "items": [{"medicine_id": "med-5", "quantity": 2}],
            "prescription_id": prescription_id,
            "prescription_share_consent": True,
            "address": f"WORKFLOW-TEST-{suffix}, 12 Test Road, Indiranagar, Bengaluru",
            "latitude": 12.9784,
            "longitude": 77.6408,
        },
        timeout=15,
    )
    assert created.status_code == 200, created.text
    request_id = created.json()["id"]
    assert created.json()["matched_pharmacy_count"] >= 1

    requests_for_pharmacy = requests.get(f"{api}/pharmacist/requests", headers=pharmacist_headers, timeout=15)
    assert requests_for_pharmacy.status_code == 200, requests_for_pharmacy.text
    assert any(item["id"] == request_id for item in requests_for_pharmacy.json())
    prescription = requests.get(f"{api}/pharmacist/requests/{request_id}/prescription", headers=pharmacist_headers, timeout=15)
    assert prescription.status_code == 200, prescription.text
    assert base64.b64decode(prescription.json()["data_base64"]) == image
    customer_cannot_review = requests.get(f"{api}/pharmacist/requests/{request_id}/prescription", headers=customer_headers, timeout=15)
    assert customer_cannot_review.status_code == 401

    review = requests.post(
        f"{api}/pharmacist/requests/{request_id}/prescription-review",
        headers=pharmacist_headers,
        json={"decision": "matches"},
        timeout=15,
    )
    assert review.status_code == 200, review.text

    offer = requests.post(
        f"{api}/pharmacist/requests/{request_id}/offer",
        headers=pharmacist_headers,
        json={"availability": "available", "items": [{"medicine_id": "med-5", "quantity": 2}], "eta_minutes": 25},
        timeout=15,
    )
    assert offer.status_code == 200, offer.text
    assert offer.json()["total"] == 201

    listed = requests.get(f"{api}/medicine-requests", headers=customer_headers, timeout=15)
    assert listed.status_code == 200, listed.text
    assert any(item["id"] == request_id and len(item["offers"]) == 1 for item in listed.json())

    selected = requests.post(
        f"{api}/medicine-requests/{request_id}/select-offer",
        headers=customer_headers,
        json={"offer_id": offer.json()["id"], "payment_method": "cod"},
        timeout=15,
    )
    assert selected.status_code == 200, selected.text
    order = selected.json()
    assert order["pharmacy_id"] == pharmacy_id
    assert order["total"] == 201

    duplicate_selection = requests.post(
        f"{api}/medicine-requests/{request_id}/select-offer",
        headers=customer_headers,
        json={"offer_id": offer.json()["id"], "payment_method": "cod"},
        timeout=15,
    )
    assert duplicate_selection.status_code == 200, duplicate_selection.text
    assert duplicate_selection.json()["id"] == order["id"]

    pharmacy_orders = requests.get(f"{api}/pharmacist/orders", headers=pharmacist_headers, timeout=15)
    assert pharmacy_orders.status_code == 200, pharmacy_orders.text
    assert any(item["id"] == order["id"] for item in pharmacy_orders.json())

    anonymous = requests.get(f"{api}/pharmacist/requests", timeout=10)
    assert anonymous.status_code == 401