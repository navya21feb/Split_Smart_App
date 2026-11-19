from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models import User, Bill, BillItem, Group
from app.schemas import (
    ParsedReceiptResponse,
    RawTextParseRequest,
    AISplitRequest,
    AISplitResponse,
    BillSaveRequest,
    BillOut,
)
from app.security import get_current_user
from app.services.ai_service import (
    parse_receipt_image,
    parse_receipt_text,
    assign_items_with_nlu,
)
from app.services.math_engine import calculate_deterministic_split

router = APIRouter(prefix="/bills", tags=["Bills & AI Engine"])
limiter = Limiter(key_func=get_remote_address)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024


@router.post("/scan-image", response_model=ParsedReceiptResponse)
@limiter.limit("15/minute")
async def scan_receipt_image(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{file.content_type}'. Upload JPEG, PNG, or WEBP.",
        )

    image_bytes = await file.read()
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds 8MB limit.")

    return parse_receipt_image(image_bytes=image_bytes, mime_type=file.content_type)


@router.post("/parse-ocr-text", response_model=ParsedReceiptResponse)
@limiter.limit("20/minute")
def parse_ocr_text(
    request: Request,
    payload: RawTextParseRequest,
    current_user: User = Depends(get_current_user),
):
    return parse_receipt_text(payload.raw_ocr_text)


@router.post("/ai-split", response_model=AISplitResponse)
@limiter.limit("30/minute")
def ai_split_expense(
    request: Request,
    payload: AISplitRequest,
    current_user: User = Depends(get_current_user),
):
    assigned_items = assign_items_with_nlu(
        items=payload.items,
        members=payload.members,
        instruction=payload.instruction,
    )

    breakdowns, grand_total = calculate_deterministic_split(
        items=assigned_items,
        members=payload.members,
        tax=payload.tax,
        discount=payload.discount,
    )

    return AISplitResponse(
        assigned_items=assigned_items,
        breakdowns=breakdowns,
        grand_total=grand_total,
    )


@router.post("/recalculate", response_model=AISplitResponse)
def recalculate_manual_edits(
    payload: AISplitRequest,
    current_user: User = Depends(get_current_user),
):
    breakdowns, grand_total = calculate_deterministic_split(
        items=payload.items,
        members=payload.members,
        tax=payload.tax,
        discount=payload.discount,
    )
    return AISplitResponse(
        assigned_items=payload.items,
        breakdowns=breakdowns,
        grand_total=grand_total,
    )


@router.post("/", response_model=BillOut)
def save_split_bill(
    payload: BillSaveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.group_id is not None:
        owned_group = (
            db.query(Group)
            .filter(Group.id == payload.group_id, Group.owner_id == current_user.id)
            .first()
        )
        if not owned_group:
            raise HTTPException(status_code=404, detail="Group not found.")

    bill = Bill(
        merchant_name=payload.merchant_name,
        subtotal=payload.subtotal,
        tax=payload.tax,
        discount=payload.discount,
        grand_total=payload.grand_total,
        paid_by=payload.paid_by,
        split_instruction=payload.split_instruction,
        settlements=payload.settlements,
        group_id=payload.group_id,
        creator_id=current_user.id,
    )
    db.add(bill)
    db.flush()

    for item in payload.items:
        db.add(
            BillItem(
                bill_id=bill.id,
                name=item.name,
                category=item.category,
                quantity=item.quantity,
                total_price=item.total_price,
                assigned_to=item.assigned_to,
            )
        )

    db.commit()
    db.refresh(bill)
    return bill


@router.get("/", response_model=List[BillOut])
def get_user_bills(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Bill)
        .filter(Bill.creator_id == current_user.id)
        .order_by(Bill.created_at.desc())
        .all()
    )


@router.patch("/{bill_id}/settle", response_model=BillOut)
def toggle_settle_bill(
    bill_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bill = (
        db.query(Bill)
        .filter(Bill.id == bill_id, Bill.creator_id == current_user.id)
        .first()
    )
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found.")

    bill.is_settled = not bill.is_settled
    db.commit()
    db.refresh(bill)
    return bill
