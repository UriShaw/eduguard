"""
Số liệu thống kê cho dashboard và trang chủ.

Nguyên tắc chung: mọi con số đều tính trên LẦN DỰ ĐOÁN GẦN NHẤT của mỗi sinh
viên, không phải trên toàn bộ các lần dự đoán. Một sinh viên được chạy lại
năm lần không vì thế mà đáng lo gấp năm.

Việc đếm được đẩy xuống SQL thay vì nạp bản ghi lên rồi đếm bằng vòng lặp
Python: với 500 sinh viên, cách cũ tải về 500 đối tượng ORM chỉ để cộng ra
bốn con số.
"""
from sqlalchemy import and_, func

from app.extensions import db
from app.ml.features import AT_RISK_LEVELS, RISK_LEVELS
from app.models import Prediction, Student
from app.services import latest


def _newest_prediction_subquery():
    """Mốc thời gian dự đoán mới nhất của từng sinh viên."""
    return (
        db.session.query(
            Prediction.student_id.label("student_id"),
            func.max(Prediction.created_at).label("created_at"),
        )
        .group_by(Prediction.student_id)
        .subquery()
    )


def _latest_predictions_query(advisor_user_id: int | None = None):
    """
    Truy vấn trả về đúng bản ghi dự đoán mới nhất của mỗi sinh viên.

    Trả về query chứ không phải kết quả, để nơi gọi chọn được là đếm bằng SQL
    hay lấy hẳn bản ghi về.
    """
    newest = _newest_prediction_subquery()

    query = (
        db.session.query(Prediction)
        .join(newest, and_(Prediction.student_id == newest.c.student_id,
                           Prediction.created_at == newest.c.created_at))
    )

    if advisor_user_id is not None:
        query = query.join(Student, Prediction.student_id == Student.student_id).filter(
            Student.advisor_user_id == advisor_user_id
        )

    return query


def summary(advisor_user_id: int | None = None) -> dict:
    """Tổng số sinh viên, số đã dự đoán, và phân bố theo bốn mức nguy cơ."""
    students_query = db.session.query(func.count(Student.student_id))
    if advisor_user_id is not None:
        students_query = students_query.filter(Student.advisor_user_id == advisor_user_id)
    total_students = students_query.scalar() or 0

    newest = _newest_prediction_subquery()
    counts_query = (
        db.session.query(Prediction.risk_level, func.count(Prediction.prediction_id))
        .join(newest, and_(Prediction.student_id == newest.c.student_id,
                           Prediction.created_at == newest.c.created_at))
    )
    if advisor_user_id is not None:
        counts_query = counts_query.join(
            Student, Prediction.student_id == Student.student_id
        ).filter(Student.advisor_user_id == advisor_user_id)

    counts = dict(counts_query.group_by(Prediction.risk_level).all())

    # Luôn trả đủ bốn khoá, kể cả mức chưa có sinh viên nào. Thiếu khoá thì
    # biểu đồ sẽ nhảy cột mỗi khi dữ liệu thay đổi.
    distribution = {level: int(counts.get(level, 0)) for level in RISK_LEVELS}
    predicted = sum(distribution.values())

    return {
        "total_students": total_students,
        "students_predicted": predicted,
        "students_not_predicted": total_students - predicted,
        "risk_distribution": distribution,
        "at_risk": sum(distribution[level] for level in AT_RISK_LEVELS),
    }


def scatter_points(advisor_user_id: int | None = None, limit: int = 500) -> dict:
    """
    Dữ liệu cho hai biểu đồ phân tán: GPA và chuyên cần đối chiếu với xác suất.

    Giới hạn số điểm vì một biểu đồ vài nghìn chấm vừa nặng vừa không đọc được;
    500 điểm đã đủ để thấy dạng phân bố.
    """
    predictions = _latest_predictions_query(advisor_user_id).limit(limit).all()
    student_ids = [p.student_id for p in predictions]

    academic = latest.academic_by_student(student_ids)
    attendance = latest.attendance_by_student(student_ids)

    gpa_points, attendance_points = [], []
    for p in predictions:
        probability = float(p.probability)
        if p.student_id in academic:
            gpa_points.append({"x": float(academic[p.student_id].gpa), "y": probability})
        if p.student_id in attendance:
            attendance_points.append(
                {"x": float(attendance[p.student_id].attendance_rate), "y": probability}
            )

    return {"gpa": gpa_points, "attendance": attendance_points}


def at_risk_by_class(advisor_user_id: int | None = None, top: int = 8) -> dict:
    """Số sinh viên mức Cao/Rất cao theo từng lớp, lấy các lớp nhiều nhất."""
    newest = _newest_prediction_subquery()

    query = (
        db.session.query(Student.class_name, func.count(Prediction.prediction_id))
        .join(Prediction, Prediction.student_id == Student.student_id)
        .join(newest, and_(Prediction.student_id == newest.c.student_id,
                           Prediction.created_at == newest.c.created_at))
        .filter(Prediction.risk_level.in_(AT_RISK_LEVELS))
    )
    if advisor_user_id is not None:
        query = query.filter(Student.advisor_user_id == advisor_user_id)

    rows = (
        query.group_by(Student.class_name)
        .order_by(func.count(Prediction.prediction_id).desc())
        .limit(top)
        .all()
    )

    return {
        "labels": [name or "Chưa phân lớp" for name, _ in rows],
        "values": [int(count) for _, count in rows],
    }


def top_at_risk(advisor_user_id: int | None = None, limit: int = 5) -> list[dict]:
    """Những sinh viên đáng lo nhất hiện tại, sắp theo xác suất giảm dần."""
    predictions = (
        _latest_predictions_query(advisor_user_id)
        .filter(Prediction.risk_level.in_(AT_RISK_LEVELS))
        .order_by(Prediction.probability.desc())
        .limit(limit)
        .all()
    )
    if not predictions:
        return []

    student_ids = [p.student_id for p in predictions]
    students = {
        s.student_id: s
        for s in db.session.query(Student).filter(Student.student_id.in_(student_ids)).all()
    }
    academic = latest.academic_by_student(student_ids)

    rows = []
    for p in predictions:
        student = students.get(p.student_id)
        if student is None:
            continue
        record = academic.get(p.student_id)
        rows.append({
            "student_id": student.student_id,
            "student_code": student.student_code,
            "full_name": student.full_name,
            "class_name": student.class_name or "—",
            "gpa": float(record.gpa) if record else None,
            "risk_level": p.risk_level,
            "probability": float(p.probability),
        })
    return rows


def public_summary() -> dict:
    """
    Số liệu cho trang chủ công khai, gộp còn ba mức.

    "Nguy cơ cao" ở đây GỘP hai mức Cao và Rất cao của hệ thống — trang chủ
    cần một bức tranh gọn, còn bốn mức đầy đủ vẫn nằm ở dashboard.
    """
    stats = summary()
    distribution = stats["risk_distribution"]
    return {
        "total_students": stats["total_students"],
        "high": distribution["Cao"] + distribution["Rất cao"],
        "medium": distribution["Trung bình"],
        "low": distribution["Thấp"],
    }
