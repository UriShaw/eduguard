"""
Dùng model đã huấn luyện: dự đoán cho một sinh viên và giải thích kết quả.

Model, pipeline và explainer SHAP được nạp một lần rồi giữ trong bộ nhớ. Nạp
lại từ đĩa mỗi request sẽ tốn vài trăm mili giây cho mỗi lần bấm dự đoán, còn
dựng lại explainer thì phải đọc lại cả tập huấn luyện.

Giải thích dùng shap.LinearExplainer vì model được chọn là tuyến tính: giá
trị SHAP tính theo công thức đóng, chính xác tuyệt đối và nhanh hơn
KernelExplainer nhiều bậc. Giá trị nằm trên thang log-odds, không phải xác
suất — dấu vẫn đúng chiều (dương làm tăng nguy cơ), nên giao diện chỉ dùng
dấu và độ lớn tương đối, không diễn giải thành "tăng bao nhiêu phần trăm".
"""
import pandas as pd
import shap

from app.ml.features import ALL_FEATURES, RAW_FEATURES, feature_label, risk_level_for
from app.ml.registry import load_artifacts

BACKGROUND_SIZE = 100

_cache: dict = {}


def reset_cache() -> None:
    """Quên model đang giữ — gọi sau khi huấn luyện lại trong cùng tiến trình."""
    _cache.clear()


def _artifacts():
    if "model" not in _cache:
        _cache["model"], _cache["pipeline"], _cache["metadata"] = load_artifacts()
    return _cache["model"], _cache["pipeline"], _cache["metadata"]


def _explainer():
    """
    Explainer SHAP, khởi tạo lười ở lần giải thích đầu tiên.

    Mẫu nền lấy từ chính tập train của model để phân phối tham chiếu khớp với
    dữ liệu model đã học.
    """
    if "explainer" not in _cache:
        from app.ml.preprocessing import RANDOM_STATE, load_training_split

        model, pipeline, _ = _artifacts()
        X_train, *_ = load_training_split()
        background = X_train.sample(n=min(BACKGROUND_SIZE, len(X_train)),
                                    random_state=RANDOM_STATE)
        _cache["explainer"] = shap.LinearExplainer(model, pipeline.transform(background))

    return _cache["explainer"]


def model_version() -> str:
    return _artifacts()[2].get("model_version", "unknown")


def to_frame(features: dict) -> pd.DataFrame:
    """
    DataFrame một dòng đúng thứ tự cột pipeline mong đợi.

    Thiếu chỉ số nào sẽ báo ngay tại đây kèm tên cụ thể, thay vì để pandas ném
    KeyError mơ hồ ở sâu trong pipeline.
    """
    missing = [f for f in RAW_FEATURES if f not in features]
    if missing:
        raise KeyError(f"Thiếu chỉ số bắt buộc: {', '.join(missing)}")
    return pd.DataFrame([{f: features[f] for f in RAW_FEATURES}])


def predict(features: dict) -> dict:
    """Trả về {probability, risk_level, is_at_risk, model_version}."""
    model, pipeline, _ = _artifacts()

    X = pipeline.transform(to_frame(features))  # chỉ transform, tuyệt đối không fit lại
    probability = float(model.predict_proba(X)[0][1])

    return {
        "probability": round(probability, 4),
        "risk_level": risk_level_for(probability),
        "is_at_risk": bool(model.predict(X)[0]),
        "model_version": model_version(),
    }


def explain(features: dict, limit: int = 5) -> list[dict]:
    """
    Các yếu tố ảnh hưởng mạnh nhất, sắp theo |SHAP| giảm dần.

    Mỗi phần tử: {feature, label, value, shap_value, effect, effect_label}.
    """
    _, pipeline, _ = _artifacts()
    X_raw = to_frame(features)
    shap_values = _explainer().shap_values(pipeline.transform(X_raw))[0]

    # Giá trị hiển thị lấy SAU bước tạo feature phái sinh nhưng TRƯỚC chuẩn
    # hoá, để người đọc thấy con số thật (GPA 6.5) chứ không phải z-score.
    engineered = pipeline.named_steps["features"].transform(X_raw).iloc[0]

    factors = [
        {
            "feature": name,
            "label": feature_label(name),
            "value": round(float(engineered[name]), 3),
            "shap_value": round(float(shap_values[i]), 4),
            "effect": "increase" if shap_values[i] > 0 else "decrease",
            "effect_label": "Làm tăng nguy cơ" if shap_values[i] > 0 else "Làm giảm nguy cơ",
        }
        for i, name in enumerate(ALL_FEATURES)
    ]
    factors.sort(key=lambda f: abs(f["shap_value"]), reverse=True)
    return factors[:limit]
