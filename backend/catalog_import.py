"""Import the Indian medicines dataset (Hugging Face: dmedhi/indian-medicines) into ``medicines``.

The dataset has name, composition, uses, side effects and an image URL only. Category, dosage
form and the prescription flag are derived here and marked as inferred. There are no prices:
pharmacies set their own price on their carry list.
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from pymongo import UpdateOne

logger = logging.getLogger(__name__)

DATASET_SOURCE = "indian-medicines"
DATASET_URL = "https://huggingface.co/datasets/dmedhi/indian-medicines"
DEFAULT_PARQUET = Path(__file__).resolve().parents[1] / "docs" / "train-00000-of-00001.parquet"

# Checked in order; the first matching group wins. (name, Ionicons icon, regex over uses + name)
CATEGORY_RULES: list[tuple[str, str, str]] = [
    ("Cancer Care", "ribbon", r"cancer|tumou?r|leuk(a)?emia|lymphoma|myeloma|carcinoma|chemotherapy"),
    ("Eye & Ear Care", "eye", r"\beyes?\b|glaucoma|conjunctiv|\bears?\b|cataract|ocular|meniere"),
    ("Diabetes Care", "water", r"diabet"),
    ("Heart & Blood Pressure", "heart", r"hypertension|blood pressure|heart|angina|cholesterol|arrhythmia|blood clot|stroke|triglycerid|bleeding|claudication|varicose"),
    ("Cold, Cough & Allergy", "cloud", r"cough|common cold|allerg|asthma|copd|chronic obstructive|rhinitis|sneez|hay fever|nasal|bronch|respiratory|mucus|pulmonary"),
    ("Skin & Hair Care", "flower", r"skin|acne|eczema|psoriasis|hair loss|dandruff|scabies|dermat|wound|burn|wart|pigment|melasma|vitiligo"),
    ("Infections", "bug", r"bacterial|viral|\bhiv\b|tuberculosis|malaria|worm|parasit|infection|herpes|hepatitis|typhoid"),
    ("Pain & Fever", "flash", r"pain|fever|inflammation|arthritis|gout|migraine|muscle spasm|muscle relax|sprain|anesthesia|anaesthesia"),
    ("Stomach & Digestion", "nutrition", r"acid|reflux|ulcer|constipation|diarrh|vomit|nausea|liver|digest|flatulence|irritable bowel|hemorrhoid|haemorrhoid|piles|indigestion|gastr|dyspepsia|anal fissure|biliary|appetite"),
    ("Brain & Mental Health", "pulse", r"schizophrenia|depress|anxiety|epilep|seizure|parkinson|alzheimer|insomnia|bipolar|mania|adhd|attention deficit|dementia|vertigo|panic|obsessive|smoking cessation|alcohol"),
    ("Hormones & Women's Health", "female", r"thyroid|infertil|hormone|contracept|menopaus|menstrua|pregnan|osteoporosis|testosterone|endometriosis|polycystic|lactation|premature labou?r|hypogonadism|uterine|vaginal|obesity"),
    ("Urinary & Kidney Care", "medical", r"urinar|kidney|renal|prostat|bladder|erectile|incontinence|premature ejaculation|phosphate|sodium in the blood|edema|oedema"),
    ("Vitamins & Nutrition", "leaf", r"vitamin|deficien|nutrition|an(a)?emia|supplement|calcium|malnutrition"),
    ("Vaccines & Immunity", "shield-checkmark", r"vaccin|immuni|transplant|rejection"),
]
OTHER_CATEGORY = ("Other Medicines", "medkit")

FORMS = [
    "Tablet", "Capsule", "Syrup", "Injection", "Cream", "Gel", "Ointment", "Drop", "Drops", "Solution",
    "Suspension", "Lotion", "Spray", "Soap", "Powder", "Vaccine", "Inhaler", "Shampoo", "Sachet",
    "Granules", "Infusion", "Respules", "Rotacap", "Lozenges", "Suppository", "Mouthwash", "Patch",
    "Paste", "Kit", "Oil", "Liquid", "Emulsion", "Facewash", "Serum", "Dusting", "Transcaps", "Expectorant",
]
FORM_LOOKUP = {form.lower(): form for form in FORMS}

# Prescription flag is inferred conservatively: required unless every active ingredient is a
# common over-the-counter one and the product is not an injection/vaccine.
OTC_INGREDIENTS = re.compile(
    r"^(paracetamol|cetirizine|levocetirizine|loratadine|calamine|clotrimazole|miconazole|ketoconazole|"
    r"simethicone|sodium chloride|oral rehydration salts?|electrolytes?|menthol|camphor|zinc oxide|"
    r"glycerin|liquid paraffin|white soft paraffin|aloe vera|vitamin [a-z0-9]+|multivitamin|folic acid|"
    r"calcium carbonate|calcium citrate|cholecalciferol|methylcobalamin|cyanocobalamin|ferrous [a-z]+|"
    r"iron|zinc|magnesium|biotin|ascorbic acid|niacinamide|pyridoxine|thiamine|riboflavin|lactobacillus.*|"
    r"saccharomyces.*|dextromethorphan|ambroxol|guaifenesin|chlorpheniramine|phenylephrine|xylometazoline|"
    r"oxymetazoline|benzoyl peroxide|salicylic acid|povidone iodine|chlorhexidine|antacid|magaldrate|"
    r"aluminium hydroxide|magnesium hydroxide|sodium bicarbonate|isabgol|ispaghula|lactulose|bisacodyl|"
    r"senna|docusate|permethrin|sunscreen|octinoxate|avobenzone|omega 3 fatty acids?|fish oil|lycopene|"
    r"lutein|coenzyme q10|l-arginine|protein)$",
    re.IGNORECASE,
)


def _clean(value: Any) -> str:
    return " ".join(str(value or "").split())


def split_uses(value: str) -> list[str]:
    """Uses arrive concatenated, e.g. 'Treatment of X (y)Treatment of Z'. Split into phrases."""
    text = _clean(value)
    parts = re.split(r"(?<=[a-z\)])(?=[A-Z])|\s+(?=(?:Treatment|Prevention|Relief|Reduces|Management)\b)", text)
    return [part.strip(" .,;") for part in parts if part and part.strip(" .,;")]


def split_side_effects(value: str) -> list[str]:
    """Side effects are space-joined title-case phrases: 'Nausea Headache Taste change'."""
    text = _clean(value)
    parts = re.split(r"\s+(?=[A-Z])|(?<=[a-z\)])(?=[A-Z])", text)
    return [part.strip(" .,;") for part in parts if part and part.strip(" .,;")]


def infer_form(name: str) -> str:
    for token in reversed(re.findall(r"[A-Za-z]+", name)):
        form = FORM_LOOKUP.get(token.lower())
        if form:
            return "Drops" if form == "Drop" else form
    return "Pack"


def infer_category(uses: str, name: str) -> tuple[str, str]:
    """Classify by the first listed use (the main indication), then by all uses and the name."""
    first_use = (split_uses(uses) or [""])[0]
    for haystack in (first_use.lower(), f"{uses} {name}".lower()):
        if not haystack.strip():
            continue
        for category, icon, pattern in CATEGORY_RULES:
            if re.search(pattern, haystack):
                return category, icon
    return OTHER_CATEGORY


def ingredients(composition: str) -> list[str]:
    parts = re.split(r"\s*\+\s*", _clean(composition))
    return [re.sub(r"\s*\([^)]*\)", "", part).strip().lower() for part in parts if part.strip()]


def infer_prescription_required(composition: str, form: str) -> bool:
    if form in {"Injection", "Vaccine", "Infusion"}:
        return True
    names = ingredients(composition)
    return not names or not all(OTC_INGREDIENTS.match(name) for name in names)


def medicine_id(name: str, composition: str) -> str:
    digest = hashlib.sha1(f"{name.casefold()}|{composition.casefold()}".encode()).hexdigest()
    return f"med-{digest[:12]}"


def build_documents(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    documents: dict[str, dict[str, Any]] = {}
    imported_at = datetime.now(timezone.utc).isoformat()
    for row in rows:
        name = _clean(row.get("name"))
        composition = _clean(row.get("composition"))
        if len(name) < 2:
            continue
        uses_raw = _clean(row.get("uses"))
        form = infer_form(name)
        category, _icon = infer_category(uses_raw, name)
        image_url = _clean(row.get("image_url"))
        doc_id = medicine_id(name, composition)
        documents[doc_id] = {
            "id": doc_id,
            "name": name,
            "name_lower": name.casefold(),
            "composition": composition,
            "uses": split_uses(uses_raw),
            "side_effects": split_side_effects(row.get("side_effects")),
            "image_url": image_url if image_url.startswith("https://") else None,
            "form": form,
            "pack": form,
            "category": category,
            "prescription_required": infer_prescription_required(composition, form),
            "prescription_flag_source": "inferred",
            "manufacturer": "",
            "price": None,
            "mrp": None,
            "availability": "Ask nearby pharmacies",
            "nearby_stores": 0,
            "source": DATASET_SOURCE,
            "source_url": DATASET_URL,
            "imported_at": imported_at,
        }
    return list(documents.values())


def read_parquet(path: Path) -> list[dict[str, Any]]:
    import pyarrow.parquet as pq

    return pq.read_table(path, columns=["name", "composition", "uses", "side_effects", "image_url"]).to_pylist()


async def ensure_catalog_indexes(db) -> None:
    await db.medicines.create_index("id", unique=True)
    await db.medicines.create_index("name_lower")
    await db.medicines.create_index("category")
    await db.medicines.create_index("source")
    await db.medicines.create_index([("name", "text"), ("composition", "text")], name="medicine_text")


async def retire_demo_catalog(db) -> int:
    """Move the old hand-written demo medicines (and carry-list rows for them) into backup collections."""
    demo = await db.medicines.find({"source": {"$exists": False}}, {"_id": 0}).to_list(1000)
    if not demo:
        return 0
    ids = [item["id"] for item in demo]
    stamp = datetime.now(timezone.utc).isoformat()
    for item in demo:
        await db.medicines_demo_backup.update_one({"id": item["id"]}, {"$set": {**item, "retired_at": stamp}}, upsert=True)
    carry = await db.pharmacy_carry_list.find({"medicine_id": {"$in": ids}}, {"_id": 0}).to_list(10000)
    for entry in carry:
        await db.pharmacy_carry_list_demo_backup.update_one(
            {"pharmacy_id": entry["pharmacy_id"], "medicine_id": entry["medicine_id"]}, {"$set": {**entry, "retired_at": stamp}}, upsert=True
        )
    await db.pharmacy_carry_list.delete_many({"medicine_id": {"$in": ids}})
    await db.medicines.delete_many({"id": {"$in": ids}, "source": {"$exists": False}})
    return len(ids)


async def rebuild_categories(db) -> int:
    counts = await db.medicines.aggregate([{"$group": {"_id": "$category", "count": {"$sum": 1}}}]).to_list(100)
    by_name = {row["_id"]: row["count"] for row in counts if row["_id"]}
    icons = {name: icon for name, icon, _pattern in CATEGORY_RULES}
    icons[OTHER_CATEGORY[0]] = OTHER_CATEGORY[1]
    ordered = [name for name, _icon, _pattern in CATEGORY_RULES] + [OTHER_CATEGORY[0]]
    categories = [
        {"id": f"cat-{index}", "name": name, "icon": icons[name], "group": "Medicines", "count": by_name[name]}
        for index, name in enumerate(item for item in ordered if by_name.get(item))
    ]
    if not categories:
        return 0
    old = await db.categories.find({"group": {"$ne": "Medicines"}}, {"_id": 0}).to_list(100)
    for item in old:
        await db.categories_demo_backup.update_one({"id": item["id"]}, {"$set": item}, upsert=True)
    await db.categories.delete_many({})
    await db.categories.insert_many(categories)
    return len(categories)


async def import_dataset(db, path: Path = DEFAULT_PARQUET) -> dict[str, int]:
    rows = read_parquet(path)
    documents = build_documents(rows)
    await ensure_catalog_indexes(db)
    for start in range(0, len(documents), 1000):
        batch = documents[start:start + 1000]
        await db.medicines.bulk_write([UpdateOne({"id": doc["id"]}, {"$set": doc}, upsert=True) for doc in batch], ordered=False)
    retired = await retire_demo_catalog(db)
    category_count = await rebuild_categories(db)
    logger.info("Imported %s medicines (%s rows), retired %s demo items, %s categories", len(documents), len(rows), retired, category_count)
    return {"rows": len(rows), "medicines": len(documents), "retired_demo": retired, "categories": category_count}


async def ensure_dataset_imported(db, path: Path = DEFAULT_PARQUET) -> None:
    """Run the import once on startup if the dataset file is present and not yet loaded."""
    if await db.medicines.count_documents({"source": DATASET_SOURCE}, limit=1):
        await ensure_catalog_indexes(db)
        return
    if not path.exists():
        logger.warning("Medicine dataset not found at %s; catalog is empty until it is imported", path)
        return
    await import_dataset(db, path)
