import asyncio

from backend.rag.pipeline import answer_medicine_question, make_catalog_documents, retrieve_documents


class FakeCursor:
    def __init__(self, documents):
        self.documents = documents

    async def to_list(self, _limit):
        return self.documents


class FakeCollection:
    def __init__(self, documents):
        self.documents = documents
        self.inserted = []

    def find(self, query, _projection):
        if query.get("review_status") == "approved":
            documents = [item for item in self.documents if item.get("review_status") == "approved"]
        else:
            documents = self.documents
        return FakeCursor(documents)

    async def insert_one(self, document):
        self.inserted.append(document)


class FakeDatabase:
    def __init__(self, knowledge=None, medicines=None):
        self.medicine_knowledge = FakeCollection(knowledge or [])
        self.medicines = FakeCollection(medicines or [])
        self.medicine_chat_logs = FakeCollection([])


def test_catalog_retrieval_returns_matching_source():
    documents = make_catalog_documents([
        {"id": "med-1", "name": "Paracetamol 500mg", "category": "OTC Medicines", "pack": "Strip of 10", "manufacturer": "Cipla"},
        {"id": "med-2", "name": "Amoxicillin 500mg", "category": "Prescription Medicines", "pack": "Strip of 10", "manufacturer": "Alkem"},
    ])

    result = retrieve_documents("What pack is Paracetamol 500mg?", documents)

    assert result
    assert result[0]["id"] == "catalog:med-1"
    assert all(document["medicine"] == "Paracetamol 500mg" for document in result)


def test_clinical_question_refuses_without_approved_knowledge(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    database = FakeDatabase(medicines=[{"id": "med-1", "name": "Paracetamol 500mg", "category": "OTC Medicines", "pack": "Strip of 10"}])

    result = asyncio.run(answer_medicine_question(database, "What are paracetamol side effects?", "user-1"))

    assert result["refused"] is True
    assert "pharmacist-reviewed" in result["answer"]


def test_emergency_question_redirects_without_retrieval():
    result = asyncio.run(answer_medicine_question(FakeDatabase(), "I took an overdose and cannot breathe", "user-1"))

    assert result["emergency"] is True
    assert result["refused"] is True
    assert "112" in result["answer"]


def test_personalized_dose_question_refuses():
    result = asyncio.run(answer_medicine_question(FakeDatabase(), "How much should I take?", "user-1"))

    assert result["refused"] is True
    assert "doctor or pharmacist" in result["answer"]