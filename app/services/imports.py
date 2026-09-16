"""
Nhập dữ liệu hàng loạt từ file CSV hoặc Excel.

Hai nguyên tắc:

1. Không dừng ở dòng lỗi đầu tiên. File thật luôn có vài dòng sai; dừng ngay
   buộc người dùng sửa từng dòng một qua nhiều lượt tải lên. Ở đây mọi dòng
   đều được kiểm tra, cuối cùng trả về báo cáo đầy đủ.

2. Kiểm tra trọn file trước, ghi CSDL sau, trong MỘT giao dịch. Bản trước gọi
   commit cho từng dòng: 500 dòng thành 500 giao dịch, và khi hỏng giữa chừng
   thì CSDL nằm ở trạng thái nhập được một nửa.
"""
from io import BytesIO

import pandas as pd

from app.extensions import db
from app.models import AcademicResult, Attendance, LearningInteraction, Student

STUDENT_COLUMNS = ["student_code", "full_name", "email", "phone",
                   "class_name", "major", "enrollment_year", "status"]
STUDENT_REQUIRED = ["student_code", "full_name"]

METRICS_COLUMNS = ["student_code", "semester", "gpa", "failed_subjects",
                   "credits_completed", "credits_registered", "attendance_rate",
                   "total_sessions", "absent_sessions", "login_count",
                   "assignment_submitted", "assignment_missing", "forum_posts",
                   "video_views", "learning_hours"]
METRICS_REQUIRED = ["student_code", "semester", "gpa", "attendance_rate"]

VALID_STATUSES = ("active", "dropped", "graduated")

# Dòng 1 là tiêu đề, còn pandas đánh chỉ số từ 0 — cộng 2 để số dòng báo lỗi
# khớp đúng với số dòng người dùng nhìn thấy trong Excel.
ROW_OFFSET = 2


class ImportError_(Exception):
    """File không đọc được hoặc thiếu cột bắt buộc — hỏng toàn bộ, không phải lỗi một dòng."""


def read_upload(file_storage) -> pd.DataFrame:
    name = (file_storage.filename or "").lower()

    if name.endswith(".csv"):
        frame = pd.read_csv(file_storage)
    elif name.endswith((".xlsx", ".xls")):
        frame = pd.read_excel(file_storage)
    else:
        raise ImportError_("Chỉ hỗ trợ file .csv, .xlsx hoặc .xls")

    # Người dùng thường thêm khoảng trắng thừa khi sửa tiêu đề bằng tay.
    frame.columns = [str(c).strip() for c in frame.columns]
    return frame


def _require_columns(frame: pd.DataFrame, required: list[str]) -> None:
    missing = [c for c in required if c not in frame.columns]
    if missing:
        raise ImportError_(f"File thiếu cột bắt buộc: {', '.join(missing)}")


def _text(value) -> str | None:
    if pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


def _number(value, cast=float, default=0):
    if pd.isna(value):
        return default
    return cast(value)


def import_students(frame: pd.DataFrame) -> dict:
    """
    Thêm sinh viên mới. Mã đã tồn tại sẽ bị BỎ QUA chứ không ghi đè.

    Ghi đè âm thầm là hành vi nguy hiểm cho một thao tác tải file: một file cũ
    tải nhầm có thể xoá sạch thông tin đã cập nhật của hàng trăm sinh viên.
    """
    _require_columns(frame, STUDENT_REQUIRED)

    existing_codes = {code for (code,) in db.session.query(Student.student_code).all()}
    pending: list[Student] = []
    seen_codes: set[str] = set()
    errors: list[dict] = []

    for index, row in frame.iterrows():
        line = index + ROW_OFFSET

        code = _text(row.get("student_code"))
        name = _text(row.get("full_name"))
        if not code or not name:
            errors.append({"row": line, "message": "Thiếu mã sinh viên hoặc họ tên"})
            continue

        if code in existing_codes:
            errors.append({"row": line, "message": f"Mã '{code}' đã có trong hệ thống — bỏ qua"})
            continue
        if code in seen_codes:
            # Trùng trong chính file đang tải: bắt ở đây, nếu không ràng buộc
            # UNIQUE sẽ làm hỏng cả lô ở bước ghi.
            errors.append({"row": line, "message": f"Mã '{code}' bị lặp trong file"})
            continue

        status = _text(row.get("status")) or "active"
        if status not in VALID_STATUSES:
            status = "active"

        try:
            year = int(row["enrollment_year"]) if "enrollment_year" in row and pd.notna(row["enrollment_year"]) else None
        except (TypeError, ValueError):
            errors.append({"row": line, "message": "Năm nhập học không phải số"})
            continue

        seen_codes.add(code)
        pending.append(Student(
            student_code=code,
            full_name=name,
            email=_text(row.get("email")),
            phone=_text(row.get("phone")),
            class_name=_text(row.get("class_name")),
            major=_text(row.get("major")),
            enrollment_year=year,
            status=status,
        ))

    return _commit(pending, errors)


def import_metrics(frame: pd.DataFrame, current_user) -> dict:
    """
    Nhập chỉ số cho nhiều sinh viên cùng lúc, khớp theo mã sinh viên.

    Giảng viên chỉ nhập được cho sinh viên mình phụ trách; các dòng còn lại
    bị báo lỗi rõ ràng chứ không âm thầm bỏ qua — người nhập cần biết dữ liệu
    của mình đã không vào hệ thống.
    """
    _require_columns(frame, METRICS_REQUIRED)

    pending = []
    errors: list[dict] = []

    for index, row in frame.iterrows():
        line = index + ROW_OFFSET

        code = _text(row.get("student_code"))
        if not code:
            errors.append({"row": line, "message": "Thiếu mã sinh viên"})
            continue

        student = db.session.query(Student).filter_by(student_code=code).first()
        if student is None:
            errors.append({"row": line, "message": f"Không tìm thấy sinh viên '{code}'"})
            continue

        if not current_user.can_edit(student):
            errors.append({"row": line, "message": f"Bạn không phụ trách sinh viên '{code}'"})
            continue

        semester = _text(row.get("semester"))
        if not semester:
            errors.append({"row": line, "message": "Thiếu học kỳ"})
            continue

        try:
            gpa = float(row["gpa"])
            attendance_rate = float(row["attendance_rate"])
        except (TypeError, ValueError):
            errors.append({"row": line, "message": "GPA hoặc tỷ lệ chuyên cần không phải số"})
            continue

        if not 0 <= gpa <= 10:
            errors.append({"row": line, "message": f"GPA {gpa} nằm ngoài khoảng 0–10"})
            continue
        if not 0 <= attendance_rate <= 100:
            errors.append({"row": line, "message": f"Chuyên cần {attendance_rate} nằm ngoài khoảng 0–100"})
            continue

        try:
            period = pd.Timestamp.today().date()
            pending.extend([
                AcademicResult(
                    student_id=student.student_id, semester=semester, gpa=gpa,
                    failed_subjects=_number(row.get("failed_subjects"), int),
                    credits_completed=_number(row.get("credits_completed"), int),
                    credits_registered=_number(row.get("credits_registered"), int),
                ),
                Attendance(
                    student_id=student.student_id, period_start=period, period_end=period,
                    attendance_rate=attendance_rate,
                    total_sessions=_number(row.get("total_sessions"), int),
                    absent_sessions=_number(row.get("absent_sessions"), int),
                ),
                LearningInteraction(
                    student_id=student.student_id, period_start=period, period_end=period,
                    login_count=_number(row.get("login_count"), int),
                    assignment_submitted=_number(row.get("assignment_submitted"), int),
                    assignment_missing=_number(row.get("assignment_missing"), int),
                    forum_posts=_number(row.get("forum_posts"), int),
                    video_views=_number(row.get("video_views"), int),
                    learning_hours=_number(row.get("learning_hours"), float),
                ),
            ])
        except (TypeError, ValueError) as exc:
            errors.append({"row": line, "message": f"Sai định dạng số: {exc}"})

    # Mỗi dòng hợp lệ sinh ra 3 bản ghi nên số dòng thành công là số bản ghi
    # chia cho 3.
    result = _commit(pending, errors)
    result["success_count"] //= 3
    return result


def _commit(pending: list, errors: list[dict]) -> dict:
    """Ghi toàn bộ bản ghi hợp lệ trong một giao dịch."""
    if not pending:
        return {"success_count": 0, "error_count": len(errors), "errors": errors}

    try:
        db.session.add_all(pending)
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        # Cả lô bị huỷ nên phải nói rõ là KHÔNG dòng nào được nhập, thay vì
        # để người dùng đoán xem phần nào đã vào.
        errors.append({"row": "—", "message": f"Không ghi được dữ liệu, đã huỷ toàn bộ: {exc}"})
        return {"success_count": 0, "error_count": len(errors), "errors": errors}

    return {"success_count": len(pending), "error_count": len(errors), "errors": errors}


def template_csv(kind: str) -> tuple[BytesIO, str]:
    """File CSV mẫu có sẵn một dòng ví dụ."""
    samples = {
        "students": (
            STUDENT_COLUMNS,
            ["SV20250001", "Nguyễn Văn An", "an.nv@example.edu.vn", "0901234567",
             "CNTT-K25-01", "Công nghệ thông tin", "2025", "active"],
            "mau_nhap_sinh_vien.csv",
        ),
        "metrics": (
            METRICS_COLUMNS,
            ["SV20250001", "2025.1", "7.5", "0", "68", "18", "86.5",
             "45", "6", "24", "11", "1", "3", "28", "12.5"],
            "mau_nhap_chi_so.csv",
        ),
    }
    if kind not in samples:
        raise ImportError_(f"Không có file mẫu cho '{kind}'")

    columns, sample, filename = samples[kind]
    content = ",".join(columns) + "\n" + ",".join(sample) + "\n"

    # BOM để Excel trên Windows mở đúng tiếng Việt thay vì ra ký tự lạ.
    return BytesIO(content.encode("utf-8-sig")), filename
