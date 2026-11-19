import json
from typing import List
from fastapi import HTTPException
from google import genai
from google.genai import types
from pydantic import BaseModel

from app.config import get_settings
from app.schemas import ParsedReceiptResponse, ParsedItem

settings = get_settings()


def _get_gemini_client() -> genai.Client:
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_google_gemini_api_key_here":
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY is not configured in the .env file.",
        )
    return genai.Client(api_key=settings.GEMINI_API_KEY)


def parse_receipt_image(image_bytes: bytes, mime_type: str) -> ParsedReceiptResponse:
    """
    Multimodal Vision OCR + Structured JSON Extraction using Gemini.
    """
    client = _get_gemini_client()

    prompt = (
        "You are a precision receipt parser for SplitSmart. Analyze this receipt image. "
        "Extract the merchant name, every purchased line item (clean up OCR typos, keep total line price), "
        "categorize each item into one of ['Food', 'Drink', 'Grocery', 'Household', 'Other'], "
        "and extract subtotal, total tax (GST/VAT/Service tax), and any discount. "
        "Ensure all prices are positive numbers. Leave assigned_to as an empty list."
    )

    try:
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                prompt,
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ParsedReceiptResponse,
                temperature=0.1,
            ),
        )
        data = json.loads(response.text)
        return ParsedReceiptResponse(**data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI Receipt Vision Parsing failed: {str(e)}")


def parse_receipt_text(raw_ocr_text: str) -> ParsedReceiptResponse:
    """
    Hybrid Edge-to-Cloud Pipeline:
    Takes raw text extracted on-device via Google ML Kit / Tesseract and structures it via Gemini.
    """
    client = _get_gemini_client()

    prompt = (
        "Clean and structure the following messy OCR receipt text into clean JSON. "
        "Fix broken characters, extract merchant_name, line items with total_price, subtotal, tax, and discount.\n\n"
        f"RAW OCR TEXT:\n{raw_ocr_text}"
    )

    try:
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ParsedReceiptResponse,
                temperature=0.1,
            ),
        )
        data = json.loads(response.text)
        return ParsedReceiptResponse(**data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI Text Parsing failed: {str(e)}")


class _AssignmentList(BaseModel):
    items: List[ParsedItem]


def assign_items_with_nlu(
    items: List[ParsedItem],
    members: List[str],
    instruction: str,
) -> List[ParsedItem]:
    """
    Natural Language Understanding (NLU) Expense Splitter:
    Maps conversational instructions strictly to valid group member names.
    """
    client = _get_gemini_client()

    items_json = json.dumps([item.model_dump() for item in items], indent=2)
    prompt = f"""
You are the Natural Language Splitting Engine for SplitSmart.
Given a list of receipt items, a list of valid group members, and a user's spoken/typed splitting instruction,
populate the `assigned_to` array for EVERY item using ONLY exact names from the valid members list.

RULES:
1. "I", "me", or "myself" refers to "You" (or the first member in the list if "You" is absent).
2. "Everyone", "all", or "shared" means assign ALL members in the valid members list.
3. If an item is not mentioned in the instruction, keep its existing `assigned_to` list; if empty, assign it to all members.
4. Never invent names not in the valid members list.

VALID MEMBERS: {json.dumps(members)}
USER INSTRUCTION: "{instruction}"

RECEIPT ITEMS:
{items_json}
"""

    try:
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=_AssignmentList,
                temperature=0.1,
            ),
        )
        parsed = json.loads(response.text)
        result_items = [ParsedItem(**it) for it in parsed.get("items", [])]
        if len(result_items) != len(items):
            raise ValueError(
                f"AI returned {len(result_items)} items but the receipt has {len(items)}. Please try again."
            )
        valid_set = set(members)
        for it in result_items:
            it.assigned_to = [m for m in it.assigned_to if m in valid_set] or list(members)
        return result_items
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI Split Assignment failed: {str(e)}")
