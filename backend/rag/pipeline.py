from collections import Counter
from datetime import datetime, timezone
import math
import os
import re
from typing import Any


TOKEN_PATTERN = re.compile(r"[a-z0-9]+")
STOP_WORDS = {
    "a", "about", "an", "and", "are", "can", "do", "does", "for", "from",
    "how", "i", "in", "is", "it", "me", "of", "on", "or", "the", "this",
    "to", "what", "when", "where", "which", "with", "you", "your",
}
EMERGENCY_PATTERN = re.compile(
    r"\b(overdose|overdosed|poisoning|can't breathe|cannot breathe|trouble breathing|shortness of breath|"
    r"chest pain|seizure|unconscious|passed out|stroke symptoms)\b",
    re.IGNORECASE,
)
PERSONALIZED_PATTERN = re.compile(
    r"\b(do i have|diagnos(?:e|is)|what's wrong with me|what is wrong with me|"
    r"should i take|how much should i|what dose should i|can i take|is it safe for me|for my (?:child|baby|condition)|"
    r"i am pregnant|i'm pregnant|my symptoms|change my dose|increase my dose|"
    r"decrease my dose|stop taking)\b",
    re.IGNORECASE,
)
CLINICAL_PATTERN = re.compile(
    r"\b(use|used for|treat|treats|dosage|dose|side effects?|warnings?|"
    r"interactions?|how to take|how much|works|indication|contraindication)\b",
    re.IGNORECASE,
)
COMMERCE_PATTERN = re.compile(r"\b(price|cost|stock|availability|available|delivery time)\b", re.IGNORECASE)


def tokenize(text: str) -> list[str]:
    return [token for token in TOKEN_PATTERN.findall(text.lower()) if len(token) > 1 and token not in STOP_WORDS]


def is_emergency_question(question: str) -> bool:
    return bool(EMERGENCY_PATTERN.search(question))


def is_personalized_question(question: str) -> bool:
    return bool(PERSONALIZED_PATTERN.search(question))


def is_clinical_question(question: str) -> bool:
    return bool(CLINICAL_PATTERN.search(question))


def make_catalog_documents(products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    documents = []
    for product in products:
        name = product.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        text = (
            f"Medicine: {name.strip()}. "
            f"Category: {product.get('category', 'not specified')}. "
            f"Pack: {product.get('pack', 'not specified')}. "
            f"Manufacturer: {product.get('manufacturer', 'not specified')}."
        )
        documents.append({
            "id": f"catalog:{product.get('id', name)}",
            "medicine": name.strip(),
            "field_type": "catalog",
            "text": text,
            "source_title": "Justlocal medicine catalog",
            "source_url": None,
            "reviewed_by": None,
            "last_reviewed": None,
        })
    return documents


def retrieve_documents(question: str, documents: list[dict[str, Any]], limit: int = 4) -> list[dict[str, Any]]:
    query_tokens = tokenize(question)
    if not query_tokens or not documents:
        return []
    exact_medicine_matches = [
        document for document in documents
        if str(document.get("medicine", "")).casefold() in question.casefold()
    ]
    if exact_medicine_matches:
        documents = exact_medicine_matches

    tokenized_documents = [tokenize(str(document.get("text", ""))) for document in documents]
    document_frequency: Counter[str] = Counter()
    for tokens in tokenized_documents:
        document_frequency.update(set(tokens))

    query_counts = Counter(query_tokens)
    query_weights = {
        token: (1 + math.log(count)) * (math.log((1 + len(documents)) / (1 + document_frequency[token])) + 1)
        for token, count in query_counts.items()
    }
    query_norm = math.sqrt(sum(weight * weight for weight in query_weights.values())) or 1
    ranked: list[tuple[float, dict[str, Any]]] = []

    for document, tokens in zip(documents, tokenized_documents):
        counts = Counter(tokens)
        weights = {
            token: (1 + math.log(count)) * (math.log((1 + len(documents)) / (1 + document_frequency[token])) + 1)
            for token, count in counts.items()
        }
        norm = math.sqrt(sum(weight * weight for weight in weights.values())) or 1
        score = sum(query_weights.get(token, 0) * weight for token, weight in weights.items()) / (query_norm * norm)
        medicine_name = str(document.get("medicine", "")).lower()
        if medicine_name and medicine_name in question.lower():
            score = min(1.0, score + 0.25)
        if score >= 0.12:
            ranked.append((score, document))

    ranked.sort(key=lambda pair: pair[0], reverse=True)
    return [document for _, document in ranked[:limit]]


def _sources(documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "id": document["id"],
            "title": document.get("source_title") or "Pharmacist-reviewed knowledge base",
            "medicine": document.get("medicine"),
            "field_type": document.get("field_type"),
            "reviewed_by": document.get("reviewed_by"),
            "last_reviewed": document.get("last_reviewed"),
            "url": document.get("source_url"),
        }
        for document in documents
    ]


def _refusal(answer: str, emergency: bool = False) -> dict[str, Any]:
    return {
        "answer": answer,
        "sources": [],
        "refused": True,
        "emergency": emergency,
        "disclaimer": "This chatbot does not diagnose or provide personalized treatment advice.",
    }


async def _audit_response(
    database: Any,
    user_id: str,
    question: str,
    response: dict[str, Any],
    documents: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if os.getenv("RAG_AUDIT_LOGGING", "true").lower() != "true":
        return response
    try:
        await database.medicine_chat_logs.insert_one({
            "user_id": user_id,
            "question": question,
            "retrieved_chunk_ids": [document["id"] for document in documents or []],
            "answer": response["answer"],
            "refused": response["refused"],
            "created_at": datetime.now(timezone.utc),
        })
    except Exception:
        pass
    return response


async def _generate_grounded_answer(question: str, documents: list[dict[str, Any]]) -> str:
    context = "\n\n".join(f"[{document['id']}] {document['text']}" for document in documents)
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key or all(document.get("field_type") == "catalog" for document in documents):
        return "\n\n".join(document["text"] for document in documents)

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            default_headers={"X-Title": "Justlocal Medicine Assistant"},
            timeout=20,
        )
        response = await client.chat.completions.create(
            model=os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini"),
            temperature=0,
            max_tokens=300,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Answer only from the supplied excerpts. Do not use outside knowledge. Catalog excerpts support "
                        "catalog fields only; clinical answers require pharmacist-reviewed excerpts. "
                        "If the excerpts do not answer the question, say: 'I don't have verified information on this.' "
                        "Do not diagnose, recommend a personalized dose, change treatment, or make emergency judgments. "
                        "Keep the answer concise and cite supporting excerpt IDs in square brackets."
                    ),
                },
                {"role": "user", "content": f"Question: {question}\n\nVerified excerpts:\n{context}"},
            ],
        )
        answer = response.choices[0].message.content
        return answer.strip() if answer else "\n\n".join(document["text"] for document in documents)
    except Exception:
        return "\n\n".join(document["text"] for document in documents)


async def answer_medicine_question(database: Any, question: str, user_id: str) -> dict[str, Any]:
    cleaned_question = question.strip()
    if is_emergency_question(cleaned_question):
        return await _audit_response(
            database,
            user_id,
            cleaned_question,
            _refusal(
                "This may be an emergency. Call your local emergency number or go to the nearest emergency department now. "
                "If you are in India, call 112.",
                emergency=True,
            ),
        )
    if is_personalized_question(cleaned_question):
        return await _audit_response(database, user_id, cleaned_question, _refusal("I can't assess personal symptoms or recommend what you should take. Please speak with a doctor or pharmacist."))
    if COMMERCE_PATTERN.search(cleaned_question):
        return await _audit_response(database, user_id, cleaned_question, _refusal("I can't check prices, stock, or delivery status here. Please use the pharmacy and order screens for that information."))

    reviewed_documents = await database.medicine_knowledge.find(
        {"review_status": "approved", "active": {"$ne": False}}, {"_id": 0}
    ).to_list(1000)
    products = await database.medicines.find({}, {"_id": 0}).to_list(500)
    catalog_documents = make_catalog_documents(products)
    clinical_question = is_clinical_question(cleaned_question)
    if clinical_question and not reviewed_documents:
        return await _audit_response(database, user_id, cleaned_question, _refusal("There isn't pharmacist-reviewed medicine guidance in the knowledge base yet. Please ask a pharmacist."))
    searchable_documents = reviewed_documents if clinical_question else reviewed_documents + catalog_documents
    retrieved = retrieve_documents(cleaned_question, searchable_documents)

    if not retrieved:
        return await _audit_response(database, user_id, cleaned_question, _refusal("I don't have verified information on this. Please ask a pharmacist."))
    if clinical_question and not all(document.get("review_status") == "approved" for document in retrieved):
        return await _audit_response(database, user_id, cleaned_question, _refusal("I don't have pharmacist-reviewed clinical information for that question. Please ask a pharmacist."), retrieved)

    answer = await _generate_grounded_answer(cleaned_question, retrieved)
    response = {
        "answer": answer,
        "sources": _sources(retrieved),
        "refused": False,
        "emergency": False,
        "disclaimer": "General information only. Follow your clinician's instructions and medicine label.",
    }
    return await _audit_response(database, user_id, cleaned_question, response, retrieved)