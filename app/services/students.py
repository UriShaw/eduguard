"""Nghiệp vụ hồ sơ sinh viên."""
from sqlalchemy import or_

from app.extensions import db
from app.models import Student, User

# Các trường người dùng được phép sửa qua biểu mẫu. Liệt kê tường minh để một
# trường mới thêm vào model không tự động trở thành trường sửa được.
EDITABLE_FIELDS = (
    "student_code", "full_name", "email", "phone",
    "class_name", "major", "enrollment_year", "status", "advisor_user_id",
)


class StudentError(Exception):
    """Dữ liệu sinh viên không hợp lệ — thông điệp hiển thị thẳng cho người dùng."""


def search(keyword: str = "", status: str = "", class_name: str = "",
           advisor_user_id: int | None = None, page: int = 1, per_page: int = 10):
    """
    Danh sách sinh viên có lọc và phân trang.

    advisor_user_id khác None sẽ giới hạn theo giảng viên phụ trách — đây là
    cách phân quyền được áp cho mọi truy vấn danh sách.
    """
    query = db.session.query(Student)

    if keyword:
        pattern = f"%{keyword.strip()}%"
        query = query.filter(or_(Student.student_code.ilike(pattern),
                                 Student.full_name.ilike(pattern)))
    if status:
        query = query.filter(Student.status == status)
    if class_name:
        query = query.filter(Student.class_name == class_name)
    if advisor_user_id is not None:
        query = query.filter(Student.advisor_user_id == advisor_user_id)

    return query.order_by(Student.student_code).paginate(
        page=page, per_page=per_page, error_out=False
    )


def get(student_id: int) -> Student | None:
    return db.session.get(Student, student_id)


def get_by_code(code: str) -> Student | None:
    return db.session.query(Student).filter_by(student_code=code).first()


def lecturer_choices() -> list[tuple[int, str]]:
    """Danh sách giảng viên để chọn làm cố vấn; 0 nghĩa là chưa gán."""
    lecturers = (
        db.session.query(User)
        .filter_by(role="lecturer", is_active_flag=True)
        .order_by(User.full_name)
        .all()
    )
    return [(0, "— Chưa gán —")] + [(u.user_id, u.full_name) for u in lecturers]


def distinct_classes(advisor_user_id: int | None = None) -> list[str]:
    query = (
        db.session.query(Student.class_name)
        .filter(Student.class_name.isnot(None))
        .distinct()
    )
    if advisor_user_id is not None:
        query = query.filter(Student.advisor_user_id == advisor_user_id)
    return sorted(row[0] for row in query.all())


def _check_unique(data: dict, exclude_id: int | None = None) -> None:
    """Mã sinh viên và email phải là duy nhất."""
    code_owner = get_by_code(data["student_code"])
    if code_owner and code_owner.student_id != exclude_id:
        raise StudentError(f"Mã sinh viên '{data['student_code']}' đã tồn tại.")

    email = data.get("email")
    if email:
        email_owner = db.session.query(Student).filter_by(email=email).first()
        if email_owner and email_owner.student_id != exclude_id:
            raise StudentError(f"Email '{email}' đã được dùng cho sinh viên khác.")


def _apply(student: Student, data: dict) -> None:
    for name in EDITABLE_FIELDS:
        if name in data:
            value = data[name]
            # Chuỗi rỗng từ ô nhập trống phải thành NULL, nếu không ràng buộc
            # UNIQUE trên email sẽ coi hai chuỗi rỗng là trùng nhau.
            setattr(student, name, value if value not in ("", 0) else None)


def create(data: dict) -> Student:
    _check_unique(data)

    student = Student()
    _apply(student, data)
    student.status = data.get("status") or "active"

    db.session.add(student)
    db.session.commit()
    return student


def update(student: Student, data: dict) -> Student:
    _check_unique(data, exclude_id=student.student_id)
    _apply(student, data)
    db.session.commit()
    return student


def delete(student: Student) -> None:
    """
    Xoá sinh viên và toàn bộ dữ liệu liên quan.

    Khoá ngoại khai báo ON DELETE CASCADE nên điểm số, chuyên cần, dự đoán,
    biên bản gặp mặt và can thiệp đều bị xoá theo — đây là hành vi cố ý, dùng
    khi cần gỡ bỏ hoàn toàn dữ liệu cá nhân của một người.
    """
    db.session.delete(student)
    db.session.commit()
