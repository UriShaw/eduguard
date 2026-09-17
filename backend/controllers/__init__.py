"""
Tầng Controller — phần dùng chung: phiên CSDL, xác thực, phân quyền, xử lý lỗi.

Xác thực bằng JWT đặt trong cookie httpOnly. Trình duyệt gọi API qua proxy
cùng nguồn của Next.js nên cookie tự đi kèm, và JavaScript không đọc được token
— một lỗi XSS không lấy cắp được phiên đăng nhập như khi lưu token trong
localStorage. Client ngoài trình duyệt vẫn gửi được header Authorization: Bearer.
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Annotated, Iterator

import jwt
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from models import SessionLocal, Student, User
from models.analytics import ImportFileError
from models.services import ServiceError

SECRET_KEY = os.getenv("SECRET_KEY", "khoa-mac-dinh-chi-dung-khi-phat-trien")
TOKEN_COOKIE = "eduguard_token"
TOKEN_HOURS = 12


def get_db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session


DB = Annotated[Session, Depends(get_db)]


# ----- Token -----

def issue_token(user: User) -> str:
    expires = datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS)
    return jwt.encode({"sub": str(user.user_id), "exp": expires}, SECRET_KEY, algorithm="HS256")


def _token_from(request: Request) -> str | None:
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header.removeprefix("Bearer ")
    return request.cookies.get(TOKEN_COOKIE)


def current_user(request: Request, db: DB) -> User:
    token = _token_from(request)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Chưa đăng nhập")
    try:
        user_id = int(jwt.decode(token, SECRET_KEY, algorithms=["HS256"])["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn")

    user = db.get(User, user_id)
    # Tài khoản bị khoá SAU khi đã cấp token vẫn phải mất quyền ngay, không chờ token hết hạn.
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Tài khoản không còn hiệu lực")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


# ----- Phân quyền -----

def staff_only(user: CurrentUser) -> User:
    """Quản trị viên hoặc giảng viên."""
    if user.is_student:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chức năng dành cho cán bộ")
    return user


def admin_only(user: CurrentUser) -> User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chức năng dành cho quản trị viên")
    return user


Staff = Annotated[User, Depends(staff_only)]
Admin = Annotated[User, Depends(admin_only)]


def load_student(db: Session, user: User, student_id: int, edit: bool = False) -> Student:
    """
    Nạp sinh viên và kiểm tra quyền — mọi route có student_id đều đi qua đây.

    Trước đây mỗi route tự lặp lại đoạn kiểm tra này, và chỉ cần một chỗ quên
    là thủng phân quyền. Luật gốc vẫn nằm ở User.can_view()/can_edit().
    """
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy sinh viên")
    if not (user.can_edit(student) if edit else user.can_view(student)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bạn không có quyền với sinh viên này")
    return student


# ----- Đăng ký -----

def register(app: FastAPI) -> None:
    from controllers import analytics, auth, students

    app.include_router(auth.router)
    app.include_router(students.router)
    app.include_router(analytics.router)

    @app.exception_handler(ServiceError)
    @app.exception_handler(ImportFileError)
    async def business_error(_request: Request, exc: Exception):
        # Lỗi nghiệp vụ mang thông điệp dành cho người dùng: trả 400 kèm nguyên văn.
        return JSONResponse(status_code=400, content={"detail": str(exc)})
