from datetime import datetime
from typing import List, Dict, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=100)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    full_name: str
    email: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class GroupCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    members: List[str] = Field(..., min_length=2)


class GroupOut(BaseModel):
    id: int
    name: str
    members: List[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ParsedItem(BaseModel):
    name: str
    category: str = "Food"
    quantity: int = 1
    total_price: float
    assigned_to: List[str] = []


class ParsedReceiptResponse(BaseModel):
    merchant_name: str
    items: List[ParsedItem]
    subtotal: float
    tax: float
    discount: float
    grand_total: float


class RawTextParseRequest(BaseModel):
    raw_ocr_text: str = Field(..., min_length=5, max_length=10000)


class AISplitRequest(BaseModel):
    items: List[ParsedItem]
    members: List[str] = Field(..., min_length=1)
    instruction: str = Field(..., min_length=2, max_length=1000)
    tax: float = 0.0
    discount: float = 0.0
    paid_by: str = "You"


class PersonBreakdown(BaseModel):
    member: str
    items_subtotal: float
    tax_share: float
    discount_share: float
    final_owed: float


class AISplitResponse(BaseModel):
    assigned_items: List[ParsedItem]
    breakdowns: List[PersonBreakdown]
    grand_total: float


class BillSaveRequest(BaseModel):
    merchant_name: str
    items: List[ParsedItem]
    subtotal: float
    tax: float
    discount: float
    grand_total: float
    paid_by: str
    split_instruction: Optional[str] = None
    settlements: Dict[str, float]
    group_id: Optional[int] = None


class BillOut(BaseModel):
    id: int
    merchant_name: str
    subtotal: float
    tax: float
    discount: float
    grand_total: float
    paid_by: str
    split_instruction: Optional[str]
    settlements: Dict[str, float]
    is_settled: bool
    created_at: datetime
    items: List[ParsedItem]

    model_config = ConfigDict(from_attributes=True)
