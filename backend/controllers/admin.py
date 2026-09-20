"""Quản trị hệ thống: tài khoản đăng nhập và cán bộ tư vấn."""
from fastapi import APIRouter, HTTPException, status

from controllers.dependencies import DB, Admin, Staff
from models import Counselor, User
from models.schemas import (
    AccountIn,
    AccountOut,
    CounselorIn,
    CounselorOut,
    PasswordResetIn,
)
from services import accounts, students

router = APIRouter(prefix="/api", tags=["Quản trị"])


def _load_user(db, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy tài khoản")
    return user


def _load_counselor(db, counselor_id: int) -> Counselor:
    counselor = db.get(Counselor, counselor_id)
    if counselor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy cán bộ tư vấn")
    return counselor


# ----- Tài khoản -----

@router.get("/users")
def list_users(_admin: Admin, db: DB, keyword: str = "", role: str = ""):
    counts, codes = accounts.advisee_counts(db), accounts.student_codes(db)
    return [{**AccountOut.model_validate(u).model_dump(), "advisees": counts.get(u.user_id, 0),
             "student_code": codes.get(u.student_id)}
            for u in accounts.search_users(db, keyword, role)]


@router.post("/users", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
def create_user(body: AccountIn, admin: Admin, db: DB):
    return accounts.save_user(db, body.model_dump(), admin)


@router.put("/users/{user_id}", response_model=AccountOut)
def update_user(user_id: int, body: AccountIn, admin: Admin, db: DB):
    return accounts.save_user(db, body.model_dump(), admin, _load_user(db, user_id))


@router.post("/users/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(user_id: int, body: PasswordResetIn, _admin: Admin, db: DB):
    accounts.reset_password(db, _load_user(db, user_id), body.password)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, admin: Admin, db: DB):
    accounts.delete_user(db, _load_user(db, user_id), admin)


# ----- Cán bộ tư vấn -----

@router.get("/counselors", response_model=list[CounselorOut])
def list_counselors(_user: Staff, db: DB):
    return students.counselors(db)


@router.post("/counselors", response_model=CounselorOut, status_code=status.HTTP_201_CREATED)
def create_counselor(body: CounselorIn, _admin: Admin, db: DB):
    return accounts.save_counselor(db, body.model_dump())


@router.put("/counselors/{counselor_id}", response_model=CounselorOut)
def update_counselor(counselor_id: int, body: CounselorIn, _admin: Admin, db: DB):
    return accounts.save_counselor(db, body.model_dump(), _load_counselor(db, counselor_id))


@router.delete("/counselors/{counselor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_counselor(counselor_id: int, _admin: Admin, db: DB):
    accounts.delete_counselor(db, _load_counselor(db, counselor_id))
