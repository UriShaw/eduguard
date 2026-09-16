"""Đăng nhập và đăng xuất."""
import logging

from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required, login_user, logout_user

from app.extensions import db
from app.forms import LoginForm
from app.models import User

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")
logger = logging.getLogger("auth")


def _landing_page(user: User) -> str:
    """Trang mở ra sau khi đăng nhập, tuỳ vai trò."""
    if user.is_student():
        return url_for("students.index")
    return url_for("analytics.dashboard")


def _safe_next(target: str | None) -> str | None:
    """
    Chỉ chấp nhận `next` là đường dẫn nội bộ.

    Không lọc thì tham số này thành lỗ hổng chuyển hướng mở: kẻ tấn công gửi
    link /auth/login?next=https://trang-gia-mao, nạn nhân đăng nhập thật rồi
    bị đẩy sang trang giả để nhập lại mật khẩu.
    """
    if target and target.startswith("/") and not target.startswith("//"):
        return target
    return None


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(_landing_page(current_user))

    form = LoginForm()

    if form.validate_on_submit():
        username = form.username.data.strip()
        user = db.session.query(User).filter_by(username=username).first()

        if user is None or not user.check_password(form.password.data):
            # Cùng một thông báo cho "sai tên" và "sai mật khẩu": phân biệt hai
            # trường hợp là tự xác nhận giúp kẻ dò rằng tài khoản có tồn tại.
            logger.warning("login_failed", extra={"username": username,
                                                  "remote_addr": request.remote_addr})
            flash("Tên đăng nhập hoặc mật khẩu không đúng.", "danger")
        elif not user.is_active:
            logger.warning("login_inactive", extra={"username": username,
                                                    "user_id": user.user_id})
            flash("Tài khoản đã bị vô hiệu hoá.", "danger")
        else:
            login_user(user, remember=form.remember_me.data)
            logger.info("login_success", extra={"user_id": user.user_id, "user_role": user.role})
            flash(f"Xin chào {user.full_name}.", "success")
            return redirect(_safe_next(request.args.get("next")) or _landing_page(user))

    return render_template("auth/login.html", form=form)


@auth_bp.route("/logout")
@login_required
def logout():
    logger.info("logout", extra={"user_id": current_user.user_id, "user_role": current_user.role})
    logout_user()
    flash("Đã đăng xuất.", "success")
    return redirect(url_for("auth.login"))
