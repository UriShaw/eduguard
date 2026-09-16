"""
Chạy dự đoán và lưu kết quả.

Tầng này nối model với CSDL: nhận bộ chỉ số, gọi model, kèm giải thích SHAP,
rồi ghi lại thành một dòng lịch sử.
"""
from app.extensions import db
from app.ml import predictor
from app.ml.features import RAW_FEATURES
from app.models import Prediction, Student


class PredictionError(Exception):
    pass


def _require_features(features: dict) -> None:
    missing = [f for f in RAW_FEATURES if features.get(f) is None]
    if missing:
        raise PredictionError(f"Thiếu chỉ số bắt buộc: {', '.join(missing)}")


def run(features: dict, with_explanation: bool = True) -> dict:
    """
    Dự đoán mà KHÔNG lưu — dùng cho chế độ thử nhanh.

    Trả về kết quả model kèm khoá "factors" nếu có yêu cầu giải thích.
    """
    _require_features(features)

    result = predictor.predict(features)
    result["factors"] = predictor.explain(features) if with_explanation else []
    return result


def run_and_save(student: Student, features: dict) -> Prediction:
    """
    Dự đoán cho một sinh viên cụ thể và ghi lại thành lịch sử.

    Giải thích SHAP được lưu ngay lúc này chứ không tính lại khi xem: model
    có thể đã được huấn luyện lại, và một kết quả trong lịch sử phải giải
    thích được bằng đúng model đã tạo ra nó.
    """
    _require_features(features)

    result = predictor.predict(features)

    record = Prediction(
        student_id=student.student_id,
        probability=result["probability"],
        risk_level=result["risk_level"],
        is_at_risk=result["is_at_risk"],
        model_version=result["model_version"],
        shap_top_factors=predictor.explain(features),
    )
    db.session.add(record)
    db.session.commit()
    return record


def get(prediction_id: int) -> Prediction | None:
    return db.session.get(Prediction, prediction_id)


def history(student: Student, page: int = 1, per_page: int = 15):
    return (
        db.session.query(Prediction)
        .filter_by(student_id=student.student_id)
        .order_by(Prediction.created_at.desc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )


def previous_of(record: Prediction) -> Prediction | None:
    """
    Lần dự đoán liền trước của cùng sinh viên, để hiển thị xu hướng.

    Một con số 72% tự nó không nói lên nhiều; biết kỳ trước là 45% thì mới
    thấy tình hình đang xấu đi nhanh.
    """
    return (
        db.session.query(Prediction)
        .filter(Prediction.student_id == record.student_id,
                Prediction.created_at < record.created_at)
        .order_by(Prediction.created_at.desc())
        .first()
    )
