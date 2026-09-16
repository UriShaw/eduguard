"""
Lấy "bản ghi gần nhất" của NHIỀU sinh viên trong một truy vấn.

Vì sao cần: hiển thị danh sách 10 sinh viên kèm GPA, chuyên cần và mức nguy
cơ gần nhất mà gọi student.latest_academic() trong vòng lặp sẽ tốn 1 + 10×3
truy vấn. Ba hàm ở đây gộp lại còn đúng 3 truy vấn, không phụ thuộc số sinh
viên trên trang.

Kỹ thuật: subquery MAX(created_at) GROUP BY student_id rồi JOIN ngược về bảng
gốc. Không dùng window function để chạy được trên cả MySQL 5.7 lẫn 8.0.
"""
from sqlalchemy import and_, func

from app.extensions import db
from app.models import (AcademicResult, Attendance, LearningInteraction,
                        Prediction)


def _latest_map(model, student_ids) -> dict:
    """{student_id: bản ghi mới nhất} cho đúng nhóm sinh viên được hỏi."""
    if not student_ids:
        return {}

    newest = (
        db.session.query(
            model.student_id.label("student_id"),
            func.max(model.created_at).label("created_at"),
        )
        .filter(model.student_id.in_(student_ids))
        .group_by(model.student_id)
        .subquery()
    )

    rows = (
        db.session.query(model)
        .join(
            newest,
            and_(model.student_id == newest.c.student_id,
                 model.created_at == newest.c.created_at),
        )
        .all()
    )

    # Hai bản ghi cùng created_at đến từng giây thì dict giữ bản gặp sau. Chấp
    # nhận được: chúng là hai lát cắt của cùng một thời điểm nên giá trị hiển
    # thị gần như nhau, và ràng buộc thời gian chặt hơn không đáng để đánh đổi.
    return {row.student_id: row for row in rows}


def academic_by_student(student_ids) -> dict:
    return _latest_map(AcademicResult, student_ids)


def attendance_by_student(student_ids) -> dict:
    return _latest_map(Attendance, student_ids)


def interaction_by_student(student_ids) -> dict:
    return _latest_map(LearningInteraction, student_ids)


def prediction_by_student(student_ids) -> dict:
    return _latest_map(Prediction, student_ids)


def overview_for(student_ids) -> dict:
    """
    Gộp cả bốn loại bản ghi gần nhất trong 4 truy vấn.

    Trả về {"academic": {...}, "attendance": {...}, "interaction": {...},
    "prediction": {...}} để template tra cứu theo student_id.
    """
    student_ids = list(student_ids)
    return {
        "academic": academic_by_student(student_ids),
        "attendance": attendance_by_student(student_ids),
        "interaction": interaction_by_student(student_ids),
        "prediction": prediction_by_student(student_ids),
    }
