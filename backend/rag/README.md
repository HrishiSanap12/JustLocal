# Customer Medicine Chat

The customer app calls the authenticated `POST /api/chat` endpoint. Retrieval uses the shared medicine catalog for non-clinical catalog questions and the MongoDB `medicine_knowledge` collection for clinical answers.

Clinical documents are retrieved only when `review_status` is `approved`. Each approved document should contain:

```json
{
  "id": "paracetamol_warnings_v1",
  "medicine": "Paracetamol",
  "field_type": "warnings",
  "text": "Plain-language, pharmacist-reviewed content.",
  "source_title": "Source document title",
  "source_url": "https://example.org/source",
  "reviewed_by": "pharmacist reviewer id",
  "last_reviewed": "2026-10-01",
  "review_status": "approved",
  "active": true
}
```

Do not mark content approved until a pharmacist has checked it. If no approved clinical entry matches a question, the API refuses instead of guessing. Personal treatment requests and emergencies are handled by guardrails before retrieval.

To enable OpenRouter generation, add these to the ignored `backend/.env` file and restart FastAPI:

```dotenv
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=openai/gpt-4o-mini
```

The key is read only by the backend and must not be added to Expo variables or frontend source. Without a key, responses remain extractive from retrieved text. Chat audit records (question, answer, and source IDs) are enabled by default; set `RAG_AUDIT_LOGGING=false` to disable them.