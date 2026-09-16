"""
Các extension Flask được khởi tạo rỗng ở đây rồi mới gắn vào app trong
create_app(). Tách ra file riêng để model và controller import được mà không
tạo vòng lặp import ngược lại app factory.
"""
from flask import jsonify, redirect, request, url_for
from flask_login import LoginManager
from flask_sqlalchemy import SQLAlchemy
from flask_wtf import CSRFProtect

db = SQLAlchemy()
csrf = CSRFProtect()
login_manager = LoginManager()

login_manager.login_message = "Vui lòng đăng nhập để tiếp tục."
login_manager.login_message_category = "warning"


@login_manager.user_loader
def load_user(user_id: str):
    from app.models import User

    return db.session.get(User, int(user_id))


@login_manager.unauthorized_handler
def unauthorized():
    """
    Xử lý request chưa đăng nhập.

    Mặc định Flask-Login chuyển hướng MỌI request về trang đăng nhập, kể cả
    request vào API. Client gọi API khi đó nhận về 302 kèm một trang HTML —
    không phân biệt được "chưa đăng nhập" với "gọi thành công", và thường
    parse JSON thất bại ở một chỗ khó hiểu. API phải nhận 401 rõ ràng.
    """
    if request.path.startswith("/api/"):
        return jsonify({"success": False, "error": "Chưa đăng nhập"}), 401

    from flask import flash

    flash(login_manager.login_message, login_manager.login_message_category)
    return redirect(url_for("auth.login", next=request.path))
