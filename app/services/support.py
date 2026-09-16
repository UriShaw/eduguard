"""Biên bản gặp mặt và kế hoạch can thiệp."""
from datetime import datetime

from app.extensions import db
from app.models import Counselor, Intervention, MeetingLog, Student

VALID_STATUSES = tuple(Intervention.STATUS_LABELS)


class SupportError(Exception):
    pass


# ----- Cố vấn -----

def counselor_choices() -> list[tuple[int, str]]:
    counselors = db.session.query(Counselor).order_by(Counselor.full_name).all()
    return [(0, "— Không chỉ định —")] + [(c.counselor_id, c.full_name) for c in counselors]


# ----- Biên bản gặp mặt -----

def meetings_of(student: Student, page: int = 1, per_page: int = 10):
    return (
        db.session.query(MeetingLog)
        .filter_by(student_id=student.student_id)
        .order_by(MeetingLog.meeting_date.desc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )


def create_meeting(student: Student, data: dict) -> MeetingLog:
    meeting = MeetingLog(
        student_id=student.student_id,
        counselor_id=data.get("counselor_id") or None,
        meeting_date=data["meeting_date"],
        meeting_type=data["meeting_type"],
        duration_minutes=data.get("duration_minutes") or 30,
        notes=data.get("notes"),
    )
    db.session.add(meeting)
    db.session.commit()
    return meeting


# ----- Can thiệp -----

def interventions_of(student: Student) -> list[Intervention]:
    """
    Toàn bộ can thiệp của một sinh viên, việc chưa xong xếp lên trước.

    Không phân trang: danh sách này là thứ cố vấn cần nhìn trọn vẹn để biết
    đã làm gì và còn nợ gì, cắt trang sẽ giấu mất phần cuối.
    """
    order = {"not_started": 0, "in_progress": 1, "completed": 2}
    items = (
        db.session.query(Intervention)
        .filter_by(student_id=student.student_id)
        .all()
    )
    # Sắp xếp trong Python vì thứ tự mong muốn không theo bảng chữ cái của
    # giá trị ENUM. Số bản ghi mỗi sinh viên rất nhỏ nên chi phí không đáng kể.
    items.sort(key=lambda i: (order.get(i.status, 9), i.due_date or i.created_at.date()))
    return items


def create_intervention(student: Student, data: dict) -> Intervention:
    if not data.get("title"):
        raise SupportError("Tiêu đề can thiệp không được để trống.")

    # Gắn với lần dự đoán mới nhất để sau này biết can thiệp này phát sinh từ
    # cảnh báo nào, và đánh giá được việc can thiệp có hiệu quả hay không.
    latest_prediction = student.latest_prediction()

    intervention = Intervention(
        student_id=student.student_id,
        prediction_id=latest_prediction.prediction_id if latest_prediction else None,
        meeting_id=data.get("meeting_id") or None,
        counselor_id=data.get("counselor_id") or None,
        category=data.get("category") or "other",
        title=data["title"].strip(),
        description=data.get("description"),
        due_date=data.get("due_date"),
        status="not_started",
    )
    db.session.add(intervention)
    db.session.commit()
    return intervention


def get_intervention(intervention_id: int) -> Intervention | None:
    return db.session.get(Intervention, intervention_id)


def set_status(intervention: Intervention, status: str) -> Intervention:
    if status not in VALID_STATUSES:
        raise SupportError(f"Trạng thái không hợp lệ: {status}")

    intervention.status = status
    # completed_at phải theo trạng thái: chuyển ngược từ hoàn thành về đang xử
    # lý mà vẫn giữ mốc hoàn thành cũ sẽ tạo ra bản ghi tự mâu thuẫn.
    intervention.completed_at = datetime.utcnow() if status == "completed" else None

    db.session.commit()
    return intervention
