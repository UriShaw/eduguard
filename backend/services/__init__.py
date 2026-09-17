"""
Tầng Model — phần nghiệp vụ.

    students.py     hồ sơ sinh viên, chỉ số học tập, gặp mặt, can thiệp
    predictions.py  dự đoán, dự đoán hàng loạt, mô phỏng, gợi ý can thiệp, xu hướng
    analytics.py    tổng quan, cảnh báo sớm
    reports.py      xuất báo cáo Excel, nhập dữ liệu từ file
    ml.py           huấn luyện, dự đoán, giải thích (không biết gì về CSDL hay HTTP)

Mọi hàm nhận Session làm tham số đầu và không import FastAPI, nên dùng chung được
cho API, lệnh dòng lệnh và bộ test.
"""
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from models import AcademicResult, Attendance, LearningInteraction, Prediction


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

