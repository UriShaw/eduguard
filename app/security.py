"""
Kiểm soát truy cập.

Trong bản trước, mỗi view tự lặp lại đoạn "tìm sinh viên, không thấy thì
chuyển hướng, thấy rồi thì kiểm tra quyền" — sáu dòng giống hệt nhau ở mười
mấy chỗ, và chỉ cần một chỗ quên là thủng phân quyền. Ở đây việc đó thành
decorator, còn luật gốc vẫn nằm ở User.can_view()/can_edit().
"""
from functools import wraps

from flask import abort, g
from flask_login import current_user

from app.extensions import db


def admin_required(view):
    """Chỉ quản trị viên."""
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not current_user.is_admin():
            abort(403)
        return view(*args, **kwargs)

    return wrapper


def staff_required(view):
    """Quản trị viên hoặc giảng viên — chặn tài khoản sinh viên."""
    @wraps(view)
    def wrapper(*args, **kwargs):
        if current_user.is_student():
            abort(403)
        return view(*args, **kwargs)

    return wrapper


def student_required(mode: str = "view", param: str = "student_id"):
    """
    Nạp sinh viên theo tham số URL rồi kiểm tra quyền, đặt vào `g.student`.

    mode="view" cho trang chỉ đọc, mode="edit" cho trang có ghi dữ liệu —
    khác biệt nằm ở chỗ sinh viên xem được hồ sơ của chính mình nhưng không
    sửa được gì trong đó.

    Không tìm thấy sinh viên trả 404 chứ không chuyển hướng kèm thông báo:
    URL sai là lỗi của phía gọi, và trả 404 thì API lẫn trang web cư xử giống
    nhau mà không cần phân nhánh.
    """
    if mode not in ("view", "edit"):
        raise ValueError("mode phải là 'view' hoặc 'edit'")

    def decorator(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            from app.models import Student

            student = db.session.get(Student, kwargs[param])
            if student is None:
                abort(404)

            allowed = current_user.can_edit(student) if mode == "edit" else current_user.can_view(student)
            if not allowed:
                abort(403)

            g.student = student
            return view(*args, **kwargs)

        return wrapper

    return decorator


def advisor_scope() -> int | None:
    """
    Bộ lọc phạm vi dữ liệu của người đang đăng nhập.

    Trả về user_id nếu là giảng viên (chỉ thấy sinh viên mình phụ trách),
    None nếu là quản trị viên (thấy toàn hệ thống). Mọi truy vấn thống kê
    đều nhận tham số này để phân quyền được áp một cách nhất quán.
    """
    return None if current_user.is_admin() else current_user.user_id
