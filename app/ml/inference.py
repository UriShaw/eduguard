"""
Dự đoán cho một sinh viên.

Model và pipeline được nạp một lần rồi giữ trong biến module. Nạp lại từ đĩa
mỗi request sẽ tốn vài trăm mili giây cho mỗi lần bấm nút dự đoán.
"""
import pandas as pd

from app.ml.features import RAW_FEATURES, risk_level_for
from app.ml.registry import load_artifacts

_model = None
_pipeline = None
_metadata = None


def _ensure_loaded():
    global _model, _pipeline, _metadata
    if _model is None:
        _model, _pipeline, _metadata = load_artifacts()
    return _model, _pipeline, _metadata


def reset_cache() -> None:
    """Quên model đang giữ trong bộ nhớ — gọi sau khi huấn luyện lại."""
    global _model, _pipeline, _metadata
    _model = _pipeline = _metadata = None


def model_version() -> str:
    _, _, metadata = _ensure_loaded()
    return metadata.get("model_version", "unknown")


def to_frame(features: dict) -> pd.DataFrame:
    """
    Dựng DataFrame một dòng đúng thứ tự cột pipeline mong đợi.

    Thiếu feature nào sẽ báo ngay tại đây kèm tên cụ thể, thay vì để pandas
    ném KeyError mơ hồ ở sâu trong pipeline.
    """
    missing = [f for f in RAW_FEATURES if f not in features]
    if missing:
        raise KeyError(f"Thiếu chỉ số bắt buộc: {', '.join(missing)}")
    return pd.DataFrame([{f: features[f] for f in RAW_FEATURES}])


def predict(features: dict) -> dict:
    """
    Trả về {"probability", "risk_level", "is_at_risk", "model_version"}.

    probability là xác suất bỏ học trong [0, 1]; risk_level là một trong bốn
    mức khai báo ở app/ml/features.py.
    """
    model, pipeline, _ = _ensure_loaded()

    X = pipeline.transform(to_frame(features))  # chỉ transform, tuyệt đối không fit lại
    probability = float(model.predict_proba(X)[0][1])

    return {
        "probability": round(probability, 4),
        "risk_level": risk_level_for(probability),
        "is_at_risk": bool(model.predict(X)[0]),
        "model_version": model_version(),
    }
