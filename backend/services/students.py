"""Hồ sơ sinh viên, chỉ số học tập, gặp mặt và kế hoạch can thiệp."""
from datetime import date, datetime

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from models import (
    INTERVENTION_STATUSES,
    AcademicResult,
    Attendance,
    Counselor,
    Intervention,
    LearningInteraction,
    MeetingLog,
    Prediction,
    Student,
    User,
)
from services import ServiceError, ml, newest_prediction_subquery

# ===========================================================================
# Sinh viên
# ===========================================================================

STUDENT_FIELDS = ("student_code", "full_name", "email", "phone", "class_name",
                  "major", "enrollment_year", "status", "advisor_user_id")


def search_students(db: Session, scope: int | None, keyword: str = "", status: str = "",
                    class_name: str = "", risk: str = "", page: int = 1, per_page: int = 12) -> dict:
    query = select(Student)
    if scope is not None:
        query = query.where(Student.advisor_user_id == scope)
    if keyword:
        pattern = f"%{keyword.strip()}%"
        query = query.where(or_(Student.student_code.ilike(pattern), Student.full_name.ilike(pattern)))
    if status:
        query = query.where(Student.status == status)
    if class_name:
        query = query.where(Student.class_name == class_name)
    if risk:
        # Mức nguy cơ của LẦN DỰ ĐOÁN GẦN NHẤT, không phải bất kỳ lần nào.
        newest = newest_prediction_subquery()
        query = (query.join(Prediction, Prediction.student_id == Student.student_id)
                 .join(newest, and_(Prediction.student_id == newest.c.sid, Prediction.created_at == newest.c.at))
                 .where(Prediction.risk_level == risk))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = db.scalars(query.order_by(Student.student_code)
                       .offset((page - 1) * per_page).limit(per_page)).all()
    return {"items": items, "total": total, "page": page, "pages": max(1, -(-total // per_page))}


def classes(db: Session, scope: int | None) -> list[str]:
    query = select(Student.class_name).where(Student.class_name.isnot(None)).distinct()
    if scope is not None:
        query = query.where(Student.advisor_user_id == scope)
    return sorted(db.scalars(query))


def lecturers(db: Session) -> list[User]:
    return db.scalars(select(User).where(User.role == "lecturer", User.is_active.is_(True))
                      .order_by(User.full_name)).all()


def save_student(db: Session, data: dict, student: Student | None = None) -> Student:
    """Tạo mới (student=None) hoặc cập nhật. Mã và email phải duy nhất."""
    exclude = student.student_id if student else None

    owner = db.scalar(select(Student).where(Student.student_code == data["student_code"]))
    if owner and owner.student_id != exclude:
        raise ServiceError(f"Mã sinh viên '{data['student_code']}' đã tồn tại.")
    if data.get("email"):
        owner = db.scalar(select(Student).where(Student.email == data["email"]))
        if owner and owner.student_id != exclude:
            raise ServiceError(f"Email '{data['email']}' đã được dùng cho sinh viên khác.")

    student = student or Student()
    for name in STUDENT_FIELDS:
        if name in data:
            # Chuỗi rỗng phải thành NULL, nếu không ràng buộc UNIQUE coi hai
            # email để trống là trùng nhau.
            setattr(student, name, None if data[name] == "" else data[name])
    student.status = student.status or "active"

    db.add(student)
    db.commit()
    return student


def delete_student(db: Session, student: Student) -> None:
    """ON DELETE CASCADE xoá theo toàn bộ dữ liệu liên quan — cố ý."""
    db.delete(student)
    db.commit()


# ===========================================================================
# Chỉ số học tập
# ===========================================================================

def record_metrics(db: Session, student: Student, data: dict) -> None:
    """
    Ghi một lát cắt chỉ số: ba bảng trong một giao dịch.

    Ba bảng là ba mặt của cùng một thời điểm; ghi rời sẽ sinh trạng thái nửa
    vời với GPA kỳ này nhưng chuyên cần kỳ trước. Không ghi đè dòng cũ — lịch
    sử chính là thứ cho thấy sinh viên đang đi lên hay đi xuống.
    """
    if data["absent_sessions"] > data["total_sessions"]:
        raise ServiceError("Số buổi vắng không thể lớn hơn tổng số buổi.")

    today, sid = date.today(), student.student_id
    db.add_all([
        AcademicResult(student_id=sid, semester=data["semester"], gpa=data["gpa"],
                       failed_subjects=data["failed_subjects"], credits_completed=data["credits_completed"],
                       credits_registered=data["credits_registered"]),
        Attendance(student_id=sid, period_start=today, period_end=today, attendance_rate=data["attendance_rate"],
                   total_sessions=data["total_sessions"], absent_sessions=data["absent_sessions"]),
        LearningInteraction(student_id=sid, period_start=today, period_end=today,
                            login_count=data["login_count"], assignment_submitted=data["assignment_submitted"],
                            assignment_missing=data["assignment_missing"], forum_posts=data["forum_posts"],
                            video_views=data["video_views"], learning_hours=data["learning_hours"]),
    ])
    db.commit()


def features_from(academic, attendance, interaction) -> dict:
    """
    Bộ chỉ số cho model. Thiếu nguồn nào thì các chỉ số tương ứng là None —
    điền đại số mặc định sẽ tạo ra dự đoán trông như thật mà dựa trên số bịa.
    """
    return {
        "gpa": academic.gpa if academic else None,
        "failed_subjects": academic.failed_subjects if academic else None,
        "credits_completed": academic.credits_completed if academic else None,
        "attendance_rate": attendance.attendance_rate if attendance else None,
        "login_count": interaction.login_count if interaction else None,
        "assignment_submitted": interaction.assignment_submitted if interaction else None,
        "assignment_missing": interaction.assignment_missing if interaction else None,
        "forum_posts": interaction.forum_posts if interaction else None,
        "video_views": interaction.video_views if interaction else None,
        "learning_hours": interaction.learning_hours if interaction else None,
    }


def latest_features(student: Student) -> dict:
    last = lambda rows: rows[-1] if rows else None  # noqa: E731 — quan hệ đã sắp theo thời gian
    return features_from(last(student.academic_results), last(student.attendances), last(student.interactions))


def is_complete(features: dict) -> bool:
    return all(features.get(f) is not None for f in ml.RAW_FEATURES)


# ===========================================================================
# Hỗ trợ sinh viên
# ===========================================================================

def counselors(db: Session) -> list[Counselor]:
    return db.scalars(select(Counselor).order_by(Counselor.full_name)).all()


def add_meeting(db: Session, student: Student, data: dict) -> MeetingLog:
    meeting = MeetingLog(**data)
    student.meetings.append(meeting)
    db.commit()
    return meeting


def sorted_interventions(student: Student) -> list[Intervention]:
    """Việc đang xử lý lên đầu, rồi chưa bắt đầu, theo hạn gần nhất. Không phân trang."""
    order = {"in_progress": 0, "not_started": 1, "completed": 2}
    return sorted(student.interventions, key=lambda i: (order[i.status], i.due_date or date.max))


def add_intervention(db: Session, student: Student, data: dict) -> Intervention:
    if not (data.get("title") or "").strip():
        raise ServiceError("Tiêu đề việc cần làm không được để trống.")

    # Gắn với lần dự đoán mới nhất để truy được can thiệp phát sinh từ cảnh
    # báo nào, và về sau đánh giá được là có hiệu quả hay không.
    latest = student.predictions[-1] if student.predictions else None
    item = Intervention(prediction_id=latest.prediction_id if latest else None,
                        **{**data, "title": data["title"].strip()})
    student.interventions.append(item)
    db.commit()
    return item


def set_intervention_status(db: Session, item: Intervention, status: str) -> Intervention:
    if status not in INTERVENTION_STATUSES:
        raise ServiceError(f"Trạng thái không hợp lệ: {status}")
    item.status = status
    # Mở lại việc đã xong mà giữ mốc hoàn thành cũ thì bản ghi tự mâu thuẫn.
    item.completed_at = datetime.utcnow() if status == "completed" else None
    db.commit()
    return item


def update_meeting(db: Session, meeting: MeetingLog, data: dict) -> MeetingLog:
    for name, value in data.items():
        setattr(meeting, name, value)
    db.commit()
    return meeting


def delete_meeting(db: Session, meeting: MeetingLog) -> None:
    """Việc can thiệp phát sinh từ buổi gặp được giữ lại, chỉ bỏ liên kết."""
    for item in db.scalars(select(Intervention).where(Intervention.meeting_id == meeting.meeting_id)):
        item.meeting_id = None
    # Gỡ khỏi danh sách của sinh viên (delete-orphan xoá bản ghi), để hồ sơ đã nạp trong phiên không giữ bản cũ.
    meeting.student.meetings.remove(meeting)
    db.commit()


def update_intervention(db: Session, item: Intervention, data: dict) -> Intervention:
    if not (data.get("title") or "").strip():
        raise ServiceError("Tiêu đề việc cần làm không được để trống.")
    status = data.pop("status", item.status)
    for name, value in {**data, "title": data["title"].strip()}.items():
        setattr(item, name, value)
    if status != item.status:
        return set_intervention_status(db, item, status)
    db.commit()
    return item


def delete_intervention(db: Session, item: Intervention) -> None:
    item.student.interventions.remove(item)
    db.commit()


# ===========================================================================
# Lịch sử chỉ số — mỗi lát cắt là bộ ba bản ghi ghi cùng lúc
# ===========================================================================

def _snapshots(student: Student) -> list[tuple]:
    """
    Các lát cắt (kết quả học tập, chuyên cần, tương tác) theo thứ tự thời gian.

    Ba bảng không có khoá nối với nhau; chúng luôn được ghi cùng nhau (nhập tay,
    nhập file, sinh dữ liệu mẫu) nên bản ghi thứ i của mỗi bảng thuộc cùng một lát cắt.
    Số dòng lệch nhau nghĩa là dữ liệu đã bị sửa ngoài ứng dụng: khi đó không ghép
    đoán mà chỉ trả phần kết quả học tập.
    """
    academic = student.academic_results
    paired = lambda rows: rows if len(rows) == len(academic) else [None] * len(academic)  # noqa: E731
    return list(zip(academic, paired(student.attendances), paired(student.interactions)))


def _snapshot_rows(student: Student, result_id: int) -> tuple:
    """Lát cắt xác định bằng result_id của bảng kết quả học tập."""
    for rows in _snapshots(student):
        if rows[0].result_id == result_id:
            return rows
    raise ServiceError("Không tìm thấy bản ghi chỉ số.")


def metrics_history(student: Student) -> list[dict]:
    history = []
    for academic, attendance, interaction in reversed(_snapshots(student)):
        history.append({
            "result_id": academic.result_id,
            "semester": academic.semester,
            "credits_registered": academic.credits_registered,
            "total_sessions": attendance.total_sessions if attendance else None,
            "absent_sessions": attendance.absent_sessions if attendance else None,
            "recorded_at": academic.created_at.isoformat(),
            **features_from(academic, attendance, interaction),
        })
    return history


def update_metrics(db: Session, student: Student, result_id: int, data: dict) -> None:
    """Sửa lỗi nhập liệu trên một lát cắt đã có. Dự đoán cũ giữ nguyên — nó phản ánh số liệu lúc chạy."""
    if data["absent_sessions"] > data["total_sessions"]:
        raise ServiceError("Số buổi vắng không thể lớn hơn tổng số buổi.")
    academic, attendance, interaction = _snapshot_rows(student, result_id)

    for name in ("semester", "gpa", "failed_subjects", "credits_completed", "credits_registered"):
        setattr(academic, name, data[name])
    if attendance:
        for name in ("attendance_rate", "total_sessions", "absent_sessions"):
            setattr(attendance, name, data[name])
    if interaction:
        for name in ("login_count", "assignment_submitted", "assignment_missing", "forum_posts", "video_views",
                     "learning_hours"):
            setattr(interaction, name, data[name])
    db.commit()


def delete_metrics(db: Session, student: Student, result_id: int) -> None:
    academic, attendance, interaction = _snapshot_rows(student, result_id)
    student.academic_results.remove(academic)
    if attendance:
        student.attendances.remove(attendance)
    if interaction:
        student.interactions.remove(interaction)
    db.commit()


def delete_prediction(db: Session, prediction: Prediction) -> None:
    """Việc can thiệp phát sinh từ lần dự đoán này được giữ lại, chỉ bỏ liên kết."""
    for item in db.scalars(select(Intervention).where(Intervention.prediction_id == prediction.prediction_id)):
        item.prediction_id = None
    prediction.student.predictions.remove(prediction)
    db.commit()
