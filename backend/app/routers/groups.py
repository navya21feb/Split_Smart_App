from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Group
from app.schemas import GroupCreate, GroupOut
from app.security import get_current_user

router = APIRouter(prefix="/groups", tags=["Groups"])


@router.get("/", response_model=List[GroupOut])
def list_groups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Group).filter(Group.owner_id == current_user.id).all()


@router.post("/", response_model=GroupOut)
def create_group(
    payload: GroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cleaned_members = list(dict.fromkeys([m.strip() for m in payload.members if m.strip()]))
    if len(cleaned_members) < 2:
        raise HTTPException(status_code=400, detail="A group needs at least 2 members.")

    group = Group(
        name=payload.name.strip(),
        members=cleaned_members,
        owner_id=current_user.id,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return group
