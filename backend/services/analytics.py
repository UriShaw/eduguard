"""
Tổng quan và cảnh báo sớm.

Mọi con số tính trên LẦN DỰ ĐOÁN GẦN NHẤT của mỗi sinh viên: một người được chạy
lại năm lần không vì thế mà đáng lo gấp năm. Việc đếm đẩy xuống SQL thay vì nạp
bản ghi lên rồi cộng bằng vòng lặp Python.
"""
from datetime import date

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from models import Intervention, Prediction, Student
from services import latest_for, ml, newest_prediction_subquery

# Tăng từ ngưỡng này (điểm phần trăm) giữa hai lần dự đoán liên tiếp thì coi là
# "đang xấu đi nhanh". 15 điểm đủ lớn để không báo động vì dao động thông thường.
DETERIORATION_THRESHOLD = 15.0



def _newest(scope: int | None):
    """Truy vấn trả đúng bản ghi dự đoán mới nhất của mỗi sinh viên trong phạm vi."""
    newest = newest_prediction_subquery()
    query = (select(Prediction)
             .join(newest, and_(Prediction.student_id == newest.c.sid, Prediction.created_at == newest.c.at)))
    if scope is not None:
        query = query.join(Student, Student.student_id == Prediction.student_id).where(
            Student.advisor_user_id == scope)
    return query


# ===========================================================================
# Dashboard
# ===========================================================================

def summary(db: Session, scope: int | None) -> dict:
    students = select(func.count(Student.student_id))
    if scope is not None:
        students = students.where(Student.advisor_user_id == scope)
    total = db.scalar(students) or 0

    newest = _newest(scope).subquery()
    counts = dict(db.execute(select(newest.c.risk_level, func.count()).group_by(newest.c.risk_level)).all())

    # Luôn đủ bốn khoá kể cả mức rỗng — thiếu khoá thì biểu đồ nhảy cột.
    distribution = {level: int(counts.get(level, 0)) for level in ml.RISK_LEVELS}
    predicted = sum(distribution.values())
    return {
        "total_students": total,
        "predicted": predicted,
        "not_predicted": total - predicted,
        "distribution": distribution,
        "at_risk": sum(distribution[level] for level in ml.AT_RISK_LEVELS),
    }


def scatter(db: Session, scope: int | None, limit: int = 500) -> list[dict]:
    """GPA và chuyên cần đối chiếu xác suất. Giới hạn điểm: vài nghìn chấm vừa nặng vừa không đọc được."""
    predictions = db.scalars(_newest(scope).limit(limit)).all()
    latest = latest_for(db, (p.student_id for p in predictions))

    points = []
    for p in predictions:
        academic, attendance = latest["academic"].get(p.student_id), latest["attendance"].get(p.student_id)
        if academic and attendance:
            points.append({"gpa": academic.gpa, "attendance": attendance.attendance_rate,
                           "risk": round(p.probability * 100, 1), "level": p.risk_level})
    return points


def by_class(db: Session, scope: int | None, top: int = 8) -> list[dict]:
    newest = _newest(scope).subquery()
    rows = db.execute(
        select(Student.class_name, func.count())
        .join(newest, newest.c.student_id == Student.student_id)
        .where(newest.c.risk_level.in_(ml.AT_RISK_LEVELS))
        .group_by(Student.class_name).order_by(func.count().desc()).limit(top)).all()
    return [{"class_name": name or "Chưa phân lớp", "count": int(count)} for name, count in rows]


# ===========================================================================
# CẢNH BÁO SỚM
# ===========================================================================
# Dashboard trả lời "ai đang có nguy cơ". Cảnh báo sớm trả lời câu hỏi cố vấn
# thực sự cần hằng ngày: "hôm nay tôi nên xử lý ai trước". Ba danh sách,
# mỗi danh sách là một loại việc bị bỏ lỡ khác nhau.

def alerts(db: Session, scope: int | None) -> dict:
    newest = {p.student_id: p for p in db.scalars(_newest(scope))}

    # 1. Đang xấu đi nhanh: so lần dự đoán mới nhất với lần liền trước.
    previous_q = (select(Prediction)
                  .where(Prediction.student_id.in_(list(newest)))
                  .order_by(Prediction.student_id, Prediction.created_at.desc()))
    previous: dict[int, Prediction] = {}
    for p in db.scalars(previous_q):
        if p.prediction_id != newest[p.student_id].prediction_id and p.student_id not in previous:
            previous[p.student_id] = p

    worsening = []
    for sid, last in newest.items():
        before = previous.get(sid)
        if before:
            delta = round((last.probability - before.probability) * 100, 1)
            if delta >= DETERIORATION_THRESHOLD:
                worsening.append((sid, {"delta": delta, "from": before.probability, "to": last.probability}))
    worsening.sort(key=lambda item: item[1]["delta"], reverse=True)

    # 2. Nguy cơ cao mà CHƯA có việc can thiệp nào đang mở — dễ lọt nhất.
    at_risk = [sid for sid, p in newest.items() if p.risk_level in ml.AT_RISK_LEVELS]
    has_plan = set(db.scalars(select(Intervention.student_id).where(
        Intervention.student_id.in_(at_risk), Intervention.status != "completed")))
    unplanned = sorted((sid for sid in at_risk if sid not in has_plan),
                       key=lambda sid: newest[sid].probability, reverse=True)

    # 3. Việc can thiệp đã quá hạn.
    overdue_q = select(Intervention).where(Intervention.status != "completed",
                                           Intervention.due_date < date.today())
    if scope is not None:
        overdue_q = overdue_q.join(Student).where(Student.advisor_user_id == scope)
    overdue = db.scalars(overdue_q.order_by(Intervention.due_date)).all()

    involved = {sid for sid, _ in worsening} | set(unplanned) | {i.student_id for i in overdue}
    students = {s.student_id: s for s in db.scalars(select(Student).where(Student.student_id.in_(list(involved))))}

    def card(sid: int, **extra) -> dict:
        s, p = students[sid], newest.get(sid)
        return {"student_id": sid, "student_code": s.student_code, "full_name": s.full_name,
                "class_name": s.class_name, "risk_level": p.risk_level if p else None,
                "probability": p.probability if p else None, **extra}

    return {
        "worsening": [card(sid, **info) for sid, info in worsening],
        "unplanned": [card(sid) for sid in unplanned],
        "overdue": [card(i.student_id, intervention_id=i.intervention_id, title=i.title,
                         due_date=i.due_date.isoformat(), days_overdue=(date.today() - i.due_date).days)
                    for i in overdue],
    }


def alert_count(db: Session, scope: int | None) -> int:
    data = alerts(db, scope)
    return len(data["worsening"]) + len(data["unplanned"]) + len(data["overdue"])

