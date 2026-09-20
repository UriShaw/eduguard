"""Tài khoản đăng nhập và cán bộ tư vấn — phần quản trị hệ thống."""
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from models import Counselor, Student, User
from services import ServiceError

MIN_PASSWORD = 6

# ===========================================================================
# Tài khoản
# ===========================================================================

def search_users(db: Session, keyword: str = "", role: str = "") -> list[User]:
    query = select(User)
    if keyword:
        pattern = f"%{keyword.strip()}%"
        query = query.where(or_(User.username.ilike(pattern), User.full_name.ilike(pattern), User.email.ilike(pattern)))
    if role:
        query = query.where(User.role == role)
    return db.scalars(query.order_by(User.role, User.username)).all()


def advisee_counts(db: Session) -> dict[int, int]:
    rows = db.execute(select(Student.advisor_user_id, func.count()).where(Student.advisor_user_id.isnot(None))
                      .group_by(Student.advisor_user_id))
    return dict(rows.all())


def student_codes(db: Session) -> dict[int, str]:
    """Mã của các hồ sơ đã gắn tài khoản — hiển thị cạnh tài khoản sinh viên."""
    rows = db.execute(select(Student.student_id, Student.student_code)
                      .join(User, User.student_id == Student.student_id))
    return dict(rows.all())


def _check_password(raw: str) -> None:
    if len(raw) < MIN_PASSWORD:
        raise ServiceError(f"Mật khẩu phải có ít nhất {MIN_PASSWORD} ký tự.")


def save_user(db: Session, data: dict, actor: User, user: User | None = None) -> User:
    """Tạo mới (user=None) hoặc cập nhật. Mật khẩu chỉ bắt buộc khi tạo mới."""
    exclude = user.user_id if user else None
    username = data["username"].strip()

    owner = db.scalar(select(User).where(User.username == username))
    if owner and owner.user_id != exclude:
        raise ServiceError(f"Tên đăng nhập '{username}' đã tồn tại.")
    if data.get("email"):
        owner = db.scalar(select(User).where(User.email == data["email"]))
        if owner and owner.user_id != exclude:
            raise ServiceError(f"Email '{data['email']}' đã được dùng cho tài khoản khác.")

    # Tài khoản sinh viên phải trỏ tới đúng một hồ sơ, và mỗi hồ sơ chỉ một tài khoản.
    student_id = data.get("student_id") if data["role"] == "student" else None
    if data["role"] == "student":
        if student_id is None or db.get(Student, student_id) is None:
            raise ServiceError("Tài khoản sinh viên phải gắn với một hồ sơ sinh viên có thật.")
        owner = db.scalar(select(User).where(User.student_id == student_id))
        if owner and owner.user_id != exclude:
            raise ServiceError(f"Hồ sơ này đã có tài khoản '{owner.username}'.")

    # Tự khoá hoặc tự hạ quyền mình là cách nhanh nhất để hệ thống không còn ai quản trị.
    if user is not None and user.user_id == actor.user_id and (data["role"] != "admin" or not data.get("is_active", True)):
        raise ServiceError("Không thể tự hạ quyền hoặc tự khoá tài khoản đang đăng nhập.")

    if user is None:
        if not data.get("password"):
            raise ServiceError("Cần đặt mật khẩu cho tài khoản mới.")
        user = User()
    if data.get("password"):
        _check_password(data["password"])
        user.set_password(data["password"])

    user.username = username
    user.full_name = data["full_name"].strip()
    user.email = data.get("email") or None
    user.role = data["role"]
    user.student_id = student_id
    user.is_active = data.get("is_active", True)

    db.add(user)
    db.commit()
    return user


def delete_user(db: Session, user: User, actor: User) -> None:
    if user.user_id == actor.user_id:
        raise ServiceError("Không thể xoá tài khoản đang đăng nhập.")
    # Sinh viên đang được phụ trách trở về trạng thái chưa gán, không bị xoá theo.
    for student in db.scalars(select(Student).where(Student.advisor_user_id == user.user_id)):
        student.advisor_user_id = None
    db.delete(user)
    db.commit()


def reset_password(db: Session, user: User, raw: str) -> None:
    _check_password(raw)
    user.set_password(raw)
    db.commit()


def change_password(db: Session, user: User, current: str, new: str) -> None:
    if not user.check_password(current):
        raise ServiceError("Mật khẩu hiện tại không đúng.")
    if current == new:
        raise ServiceError("Mật khẩu mới phải khác mật khẩu hiện tại.")
    reset_password(db, user, new)


# ===========================================================================
# Cán bộ tư vấn
# ===========================================================================

COUNSELOR_FIELDS = ("full_name", "title", "email", "phone")


def save_counselor(db: Session, data: dict, counselor: Counselor | None = None) -> Counselor:
    if data.get("email"):
        owner = db.scalar(select(Counselor).where(Counselor.email == data["email"]))
        if owner and (counselor is None or owner.counselor_id != counselor.counselor_id):
            raise ServiceError(f"Email '{data['email']}' đã được dùng cho cán bộ khác.")

    counselor = counselor or Counselor()
    for name in COUNSELOR_FIELDS:
        value = data.get(name)
        setattr(counselor, name, value.strip() if isinstance(value, str) and value.strip() else None)
    if not counselor.full_name:
        raise ServiceError("Họ tên cán bộ không được để trống.")

    db.add(counselor)
    db.commit()
    return counselor


def delete_counselor(db: Session, counselor: Counselor) -> None:
    """Buổi gặp và việc can thiệp của cán bộ này được giữ lại, chỉ bỏ liên kết (ON DELETE SET NULL)."""
    db.delete(counselor)
    db.commit()
