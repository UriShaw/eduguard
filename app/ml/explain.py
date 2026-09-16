"""
Giải thích dự đoán bằng SHAP.

Dùng LinearExplainer vì model được chọn là tuyến tính: giá trị SHAP tính được
theo công thức đóng, chính xác tuyệt đối và nhanh hơn KernelExplainer nhiều
bậc — quan trọng vì mỗi lần dự đoán đều gọi hàm này.

Đơn vị: giá trị SHAP nằm trên thang log-odds, không phải xác suất. Dấu vẫn
đúng chiều (dương làm tăng nguy cơ) nên phần hiển thị chỉ dùng dấu và độ lớn
tương đối, không diễn giải con số như "tăng bao nhiêu phần trăm".
"""
import shap

from app.ml.features import ALL_FEATURES, feature_label
from app.ml.inference import to_frame
from app.ml.registry import load_artifacts

BACKGROUND_SIZE = 100

_explainer = None
_pipeline = None


def _ensure_explainer():
    """
    Khởi tạo explainer một lần.

    Mẫu nền lấy từ chính tập train của model để phân phối tham chiếu khớp với
    dữ liệu model đã học.
    """
    global _explainer, _pipeline
    if _explainer is None:
        from app.ml.dataset import RANDOM_STATE, load_training_split

        model, _pipeline, _ = load_artifacts()
        X_train, *_ = load_training_split()

        background = X_train.sample(
            n=min(BACKGROUND_SIZE, len(X_train)), random_state=RANDOM_STATE
        )
        _explainer = shap.LinearExplainer(model, _pipeline.transform(background))

    return _explainer, _pipeline


def reset_cache() -> None:
    global _explainer, _pipeline
    _explainer = _pipeline = None


def top_factors(features: dict, limit: int = 5) -> list[dict]:
    """
    Các yếu tố ảnh hưởng mạnh nhất tới dự đoán, sắp theo |SHAP| giảm dần.

    Mỗi phần tử: {feature, label, value, shap_value, effect, effect_label}.
    """
    explainer, pipeline = _ensure_explainer()

    X_raw = to_frame(features)
    shap_values = explainer.shap_values(pipeline.transform(X_raw))[0]

    # Giá trị hiển thị lấy sau bước tạo feature phái sinh nhưng TRƯỚC chuẩn
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
