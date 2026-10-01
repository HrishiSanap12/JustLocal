"""Import the supplied medicine catalog CSV into a MongoDB staging collection.

Nothing in this collection is visible through the live catalog API. Records need
review and normalization before they are promoted to ``medicines``.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[1]
EXPECTED_COLUMNS = {
    "sub_category",
    "product_name",
    "salt_composition",
    "product_price",
    "product_manufactured",
    "medicine_desc",
    "side_effects",
    "drug_interactions",
}
STAGING_COLLECTION = "medicine_import_staging"
IMPORTS_COLLECTION = "medicine_imports"
PRICE_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clean(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().split())


def parse_price(value: str) -> float | None:
    match = PRICE_RE.search(value or "")
    if not match:
        return None
    try:
        amount = Decimal(match.group().replace(",", ""))
    except InvalidOperation:
        return None
    if not amount.is_finite() or amount < 0:
        return None
    return float(amount)


def parse_interactions(value: str) -> tuple[dict[str, Any] | None, str | None]:
    raw = clean(value)
    if not raw:
        return None, None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None, "invalid_json"
    if not isinstance(parsed, dict):
        return None, "unexpected_json_type"
    return parsed, None


def stable_record_id(row: dict[str, str]) -> str:
    identity = "|".join(
        clean(row.get(key, "")).casefold()
        for key in ("product_name", "salt_composition", "product_manufactured")
    )
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()


def transform(row: dict[str, str], row_number: int, import_id: str) -> dict[str, Any]:
    interactions, interactions_error = parse_interactions(row.get("drug_interactions", ""))
    raw_price = clean(row.get("product_price", ""))
    product_identity = stable_record_id(row)
    normalized = {
        "id": f"csvrow-{import_id.rsplit(':', 1)[-1][:16]}-{row_number:06d}",
        "name": clean(row.get("product_name", "")),
        "category": clean(row.get("sub_category", "")),
        "composition": clean(row.get("salt_composition", "")),
        "manufacturer": clean(row.get("product_manufactured", "")),
        "description": clean(row.get("medicine_desc", "")),
        "side_effects_raw": clean(row.get("side_effects", "")),
        "drug_interactions_raw": clean(row.get("drug_interactions", "")),
        "drug_interactions": interactions,
        "source_price_raw": raw_price,
        "source_price": parse_price(raw_price),
        "source": {
            "file_import_id": import_id,
            "file_name": "medicine_data.csv",
            "row_number": row_number,
            "product_identity": product_identity,
        },
        "catalog_status": "pending_review",
        "review_required": True,
        "imported_at": datetime.now(timezone.utc),
    }
    if interactions_error:
        normalized["drug_interactions_parse_error"] = interactions_error
    if not normalized["name"]:
        normalized["validation_errors"] = ["missing product_name"]
    if normalized["source_price"] is None and raw_price:
        normalized.setdefault("validation_errors", []).append("unparseable product_price")
    return normalized


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path", type=Path, help="Path to medicine_data.csv")
    parser.add_argument("--encoding", default="utf-8-sig", help="CSV text encoding (default: utf-8-sig)")
    parser.add_argument("--batch-size", type=int, default=2000)
    parser.add_argument("--apply", action="store_true", help="Write batches into MongoDB staging")
    parser.add_argument("--database", help="Override DB_NAME from backend/.env")
    args = parser.parse_args()

    if args.batch_size < 1 or args.batch_size > 5000:
        parser.error("--batch-size must be between 1 and 5000")
    if not args.csv_path.is_file():
        parser.error(f"CSV file does not exist: {args.csv_path}")

    csv.field_size_limit(20 * 1024 * 1024)
    file_hash = sha256_file(args.csv_path)
    import_id = f"medicine_data_csv:{file_hash}"
    print(f"CSV: {args.csv_path}")
    print(f"Bytes: {args.csv_path.stat().st_size:,}")
    print(f"SHA-256: {file_hash}")
    print(f"Mode: {'APPLY to staging' if args.apply else 'dry run'}")

    load_dotenv(BACKEND_DIR / ".env")
    mongo_url = os.environ.get("MONGO_URL")
    if args.apply and not mongo_url:
        print("MONGO_URL is missing from backend/.env or the environment.", file=sys.stderr)
        return 2

    client = None
    collection = None
    imports = None
    if args.apply:
        try:
            from pymongo import MongoClient, UpdateOne
        except Exception as exc:
            print(f"Could not load PyMongo: {exc}", file=sys.stderr)
            return 2
        client = MongoClient(mongo_url, serverSelectionTimeoutMS=10000)
        database_name = args.database or os.environ.get("DB_NAME", "justlocal")
        client.admin.command("ping")
        database = client[database_name]
        collection = database[STAGING_COLLECTION]
        imports = database[IMPORTS_COLLECTION]
        superseded = collection.update_many(
            {
                "source.file_import_id": import_id,
                "id": {"$regex": r"^csv-[0-9a-f]{64}$"},
            },
            {"$set": {"catalog_status": "superseded", "review_required": False}},
        ).modified_count
        imports.update_one(
            {"_id": import_id},
            {"$set": {
                "source_file": args.csv_path.name,
                "source_size_bytes": args.csv_path.stat().st_size,
                "status": "in_progress",
                "started_at": datetime.now(timezone.utc),
                "target_collection": STAGING_COLLECTION,
                "review_required": True,
            }},
            upsert=True,
        )
        print(f"MongoDB: connected; database={database_name}; collection={STAGING_COLLECTION}")
        if superseded:
            print(f"Marked {superseded:,} records from the earlier deduplicated attempt as superseded.")

    batch: list[Any] = []
    seen_product_identities: set[str] = set()
    rows_read = 0
    invalid_rows = 0
    repeated_product_rows = 0
    write_errors = 0
    try:
        with args.csv_path.open("r", encoding=args.encoding, newline="") as source:
            reader = csv.DictReader(source)
            columns = set(reader.fieldnames or [])
            missing = EXPECTED_COLUMNS - columns
            if missing:
                raise ValueError(f"CSV is missing required columns: {', '.join(sorted(missing))}")
            for row_number, row in enumerate(reader, start=2):
                rows_read += 1
                document = transform(row, row_number, import_id)
                product_identity = document["source"]["product_identity"]
                if product_identity in seen_product_identities:
                    repeated_product_rows += 1
                else:
                    seen_product_identities.add(product_identity)
                if document.get("validation_errors"):
                    invalid_rows += 1
                if args.apply:
                    batch.append(UpdateOne({"id": document["id"]}, {"$set": document}, upsert=True))
                    if len(batch) >= args.batch_size:
                        result = collection.bulk_write(batch, ordered=False)
                        write_errors += len(result.bulk_api_result.get("writeErrors", []))
                        batch.clear()
                        if rows_read % 10000 == 0:
                            print(f"Processed {rows_read:,} rows…")
                elif rows_read <= 3:
                    preview = f"Preview row {rows_read}: {document['name']} | {document['category']} | {document['source_price_raw']}"
                    print(ascii(preview))
        if batch:
            result = collection.bulk_write(batch, ordered=False)
            write_errors += len(result.bulk_api_result.get("writeErrors", []))
        if args.apply:
            imports.update_one(
                {"_id": import_id},
                {"$set": {
                    "status": "complete" if not write_errors else "completed_with_errors",
                    "rows_read": rows_read,
                    "source_rows": rows_read,
                    "distinct_product_identities": len(seen_product_identities),
                    "repeated_product_rows": repeated_product_rows,
                    "invalid_rows": invalid_rows,
                    "write_errors": write_errors,
                    "completed_at": datetime.now(timezone.utc),
                }},
            )
    except Exception as exc:
        if args.apply and imports is not None:
            imports.update_one(
                {"_id": import_id},
                {"$set": {
                    "status": "failed",
                    "rows_read": rows_read,
                    "invalid_rows": invalid_rows,
                    "failure": str(exc)[:1000],
                    "failed_at": datetime.now(timezone.utc),
                }},
            )
        print(f"Import stopped after {rows_read:,} rows: {exc}", file=sys.stderr)
        return 1
    finally:
        if client is not None:
            client.close()

    print(f"Rows read: {rows_read:,}; distinct product identities: {len(seen_product_identities):,}; repeated product rows: {repeated_product_rows:,}; validation issues: {invalid_rows:,}; write errors: {write_errors:,}")
    if not args.apply:
        print("Dry run only. Add --apply to write pending-review records to MongoDB staging.")
    return 0 if not write_errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
