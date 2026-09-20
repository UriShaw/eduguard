"""Đăng nhập, đăng xuất, thông tin người dùng hiện tại."""
import logging
import os

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select

from controllers.dependencies import (
    DB,
    TOKEN_COOKIE,
    TOKEN_HOURS,
    CurrentUser,
    issue_token,
)
from models import User
from models.schemas import LoginIn, PasswordChangeIn, UserOut
from services import accounts

router = APIRouter(prefix="/api/auth", tags=["Xác thực"])
logger = logging.getLogger("auth")


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, request: Request, response: Response, db: DB):
    user = db.scalar(select(User).where(User.username == body.username.strip()))

    # Cùng một thông báo cho "sai tên" và "sai mật khẩu": phân biệt hai trường
    # hợp là tự xác nhận giúp kẻ dò rằng tài khoản có tồn tại.
    if user is None or not user.check_password(body.password):
        logger.warning("Đăng nhập thất bại: %s từ %s", body.username, request.client.host if request.client else "?")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Tên đăng nhập hoặc mật khẩu không đúng")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tài khoản đã bị vô hiệu hoá")

    response.set_cookie(
        TOKEN_COOKIE, issue_token(user),
        max_age=TOKEN_HOURS * 3600,
        httponly=True,       # JavaScript không đọc được — XSS không lấy cắp được phiên
        samesite="lax",      # chặn gửi kèm từ trang khác khi submit form (CSRF)
        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
        path="/",
    )
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    response.delete_cookie(TOKEN_COOKIE, path="/")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(body: PasswordChangeIn, user: CurrentUser, db: DB):
    """Mọi vai trò tự đổi được mật khẩu của mình; phải nhập đúng mật khẩu hiện tại."""
    accounts.change_password(db, user, body.current_password, body.new_password)
