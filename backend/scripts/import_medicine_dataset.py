"""Load (or reload) the Indian medicines dataset into MongoDB.

Usage: python scripts/import_medicine_dataset.py [path/to/train-00000-of-00001.parquet]
"""
import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from catalog_import import DEFAULT_PARQUET, import_dataset  # noqa: E402


async def main() -> None:
    load_dotenv(BACKEND_DIR / ".env")
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PARQUET
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    try:
        result = await import_dataset(client[os.environ.get("DB_NAME", "justlocal")], path)
        print(result)
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
