"""
Tầng Model — nghiệp vụ cốt lõi: sinh viên, chỉ số, dự đoán, hỗ trợ sinh viên.

Mọi hàm nhận Session làm tham số đầu. Không import FastAPI, không biết HTTP —
nhờ vậy dùng chung được cho API, lệnh dòng lệnh và bộ test.
"""
from datetime import date, datetime

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from models import (AcademicResult, Attendance, Counselor, Intervention,
                    INTERVENTION_STATUSES, LearningInteraction, MeetingLog,
                    Prediction, Student, User, ml)


class ServiceError(Exception):
    """Lỗi nghiệp vụ — thông điệp hiển thị thẳng cho người dùng."""


# ===========================================================================
# Bản ghi gần nhất của nhiều sinh viên
# ===========================================================================

def _latest(db: Session, model, student_ids) -> dict:
    """
    {student_id: bản ghi mới nhất} trong MỘT truy vấn.

    Lấy lẻ theo từng sinh viên cho một trang 12 người tốn 1 + 12×4 truy vấn;
    hàm này giữ số truy vấn cố định. Không dùng window function để chạy được
    cả trên MySQL 5.7.
    """
    ids = list(student_ids)
    if not ids:
        return {}
    newest = (select(model.student_id.label("sid"), func.max(model.created_at).label("at"))
              .where(model.student_id.in_(ids)).group_by(model.student_id).subquery())
    rows = db.scalars(select(model).join(
        newest, and_(model.student_id == newest.c.sid, model.created_at == newest.c.at)))
    return {row.student_id: row for row in rows}


def latest_for(db: Session, student_ids) -> dict:
    ids = list(student_ids)
    return {
        "academic": _latest(db, AcademicResult, ids),
        "attendance": _latest(db, Attendance, ids),
        "interaction": _latest(db, LearningInteraction, ids),
        "prediction": _latest(db, Prediction, ids),
    }


def newest_prediction_subquery():
    """Mốc dự đoán mới nhất của từng sinh viên — nền của mọi thống kê theo mức nguy cơ."""
    return (select(Prediction.student_id.label("sid"), func.max(Prediction.created_at).label("at"))
            .group_by(Prediction.student_id).subquery())


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
# Dự đoán
# ===========================================================================

def predict_and_save(db: Session, student: Student, features: dict) -> Prediction:
    if not is_complete(features):
        raise ServiceError("Chưa đủ mười chỉ số để dự đoán.")

    result = ml.predict(features)
    record = Prediction(student_id=student.student_id, probability=result["probability"],
                        risk_level=result["risk_level"], is_at_risk=result["is_at_risk"],
                        model_version=result["model_version"], shap_top_factors=ml.explain(features))
    db.add(record)
    db.commit()
    return record


def predict_outdated(db: Session, scope: int | None = None) -> dict:
    """
    DỰ ĐOÁN HÀNG LOẠT cho mọi sinh viên có chỉ số MỚI HƠN lần dự đoán gần nhất.

    Mắt xích còn thiếu của quy trình: sau mỗi đợt nhập chỉ số cho cả khoa, bản
    trước phải bấm dự đoán lần lượt từng người. Sinh viên đã có dự đoán ứng với
    chỉ số hiện tại được bỏ qua để lịch sử không bị nhân bản.
    """
    query = select(Student.student_id)
    if scope is not None:
        query = query.where(Student.advisor_user_id == scope)
    latest = latest_for(db, db.scalars(query))

    pending, skipped, up_to_date = [], 0, 0
    for sid, academic in latest["academic"].items():
        attendance, interaction = latest["attendance"].get(sid), latest["interaction"].get(sid)
        features = features_from(academic, attendance, interaction)
        if not is_complete(features):
            skipped += 1
            continue

        newest_metric = max(academic.created_at, attendance.created_at, interaction.created_at)
        last = latest["prediction"].get(sid)
        if last and last.created_at >= newest_metric:
            up_to_date += 1
            continue
        pending.append((sid, features))

    # Model gọi MỘT lần cho cả lô; chỉ phần giải thích SHAP là theo từng người.
    probabilities = ml.predict_many([f for _, f in pending])
    version = ml.model_info()["version"] if pending else None
    for (sid, features), probability in zip(pending, probabilities):
        db.add(Prediction(student_id=sid, probability=probability, risk_level=ml.risk_level_for(probability),
                          is_at_risk=probability >= 0.5, model_version=version,
                          shap_top_factors=ml.explain(features)))
    db.commit()

    return {"predicted": len(pending), "skipped": skipped, "up_to_date": up_to_date}


def simulate(base: dict, changes: dict) -> dict:
    """
    MÔ PHỎNG "NẾU… THÌ": nguy cơ thay đổi thế nào khi cải thiện một vài chỉ số.

    Không ghi gì vào CSDL. Cố vấn dùng để trả lời câu hỏi thực tế — "nếu em ấy
    đi học đều lên 85% thì sao" — và chọn can thiệp vào chỗ có tác dụng nhất.
    Giá trị ngoài vùng dữ liệu model đã học được đánh dấu, vì ở đó dự đoán
    không còn đáng tin.
    """
    before = ml.predict(base)
    scenario = {**base, **{k: v for k, v in changes.items() if k in ml.RAW_FEATURES}}
    after = ml.predict(scenario)

    ranges = ml.training_ranges()
    outside = [ml.LABELS[f] for f, v in scenario.items()
               if f in ranges and not ranges[f][0] <= float(v) <= ranges[f][1]]

    return {"before": before, "after": after,
            "delta": round((after["probability"] - before["probability"]) * 100, 1),
            "outside_training_range": outside}


def trend(student: Student) -> list[dict]:
    """
    Diễn biến theo học kỳ cho biểu đồ ở hồ sơ: GPA, chuyên cần, và xác suất
    nguy cơ của lần dự đoán gần nhất tính đến hết kỳ đó.
    """
    points = []
    for i, academic in enumerate(student.academic_results):
        attendance = student.attendances[i] if i < len(student.attendances) else None
        # Dự đoán cuối cùng được chạy trước khi có lát cắt chỉ số tiếp theo.
        next_at = (student.academic_results[i + 1].created_at
                   if i + 1 < len(student.academic_results) else datetime.max)
        risk = [p for p in student.predictions if academic.created_at <= p.created_at < next_at]
        points.append({
            "semester": academic.semester,
            "gpa": academic.gpa,
            "attendance": attendance.attendance_rate if attendance else None,
            "risk": round(risk[-1].probability * 100, 1) if risk else None,
        })
    return points


# ===========================================================================
# Gợi ý can thiệp từ giải thích SHAP
# ===========================================================================
# Nối kết quả dự đoán với hành động: model đã chỉ ra yếu tố nào đẩy nguy cơ
# lên, bảng dưới quy mỗi nhóm yếu tố về một việc cụ thể cố vấn có thể làm.

PLAYBOOK = [
    ({"failed_subjects", "gpa", "academic_score"}, "peer_tutoring", "Phụ đạo các môn đang yếu",
     "Ghép nhóm học tập với sinh viên khá, ưu tiên các môn đã trượt hoặc điểm thấp."),
    ({"attendance_rate", "attendance_score"}, "parental_outreach", "Trao đổi với gia đình về chuyên cần",
     "Thông báo tình hình vắng học và tìm hiểu nguyên nhân: đi làm thêm, sức khoẻ hay mất động lực."),
    ({"assignment_missing", "assignment_submitted", "engagement_score"}, "academic_counseling",
     "Lập kế hoạch nộp bù bài tập", "Rà soát các bài còn thiếu, thống nhất hạn nộp bù cho từng môn."),
    ({"login_count", "video_views", "forum_posts", "learning_hours"}, "advising",
     "Theo dõi việc học trực tuyến",
     "Kiểm tra sinh viên có gặp khó khăn về thiết bị, kết nối hay cách dùng hệ thống học tập không."),
    ({"credits_completed"}, "advising", "Rà soát tiến độ tích luỹ tín chỉ",
     "Đối chiếu với chương trình đào tạo, lên kế hoạch học lại hợp lý."),
]


def suggest_interventions(factors: list[dict] | None, existing: list[Intervention] = ()) -> list[dict]:
    """
    Gợi ý việc cần làm từ các yếu tố đang LÀM TĂNG nguy cơ.

    Bỏ qua loại việc đang mở — không nhắc lại điều cố vấn đã làm.
    """
    open_categories = {i.category for i in existing if i.status != "completed"}
    suggestions, used = [], set()
    for factor in factors or []:
        if factor.get("effect") != "increase":
            continue
        for features, category, title, description in PLAYBOOK:
            if factor["feature"] in features and title not in used and category not in open_categories:
                used.add(title)
                suggestions.append({"category": category, "title": title, "description": description,
                                    "reason": factor.get("label", factor["feature"])})
    return suggestions


# ===========================================================================
# Hỗ trợ sinh viên
# ===========================================================================

def counselors(db: Session) -> list[Counselor]:
    return db.scalars(select(Counselor).order_by(Counselor.full_name)).all()


def add_meeting(db: Session, student: Student, data: dict) -> MeetingLog:
    meeting = MeetingLog(student_id=student.student_id, **data)
    db.add(meeting)
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
    item = Intervention(student_id=student.student_id, prediction_id=latest.prediction_id if latest else None,
                        **{**data, "title": data["title"].strip()})
    db.add(item)
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
