"""
Lưu và nạp bộ hiện vật của model.

Model và pipeline LUÔN đi thành cặp: pipeline giữ tham số chuẩn hoá học từ
tập train, dùng lẫn pipeline của lần train này với model của lần train khác
sẽ cho dự đoán sai mà không báo lỗi gì.
"""
import json
from datetime import datetime
from pathlib import Path

import joblib

from app.config import Config

MODEL_DIR = Path(Config.MODEL_DIR)
MODEL_PATH = MODEL_DIR / "model.pkl"
PIPELINE_PATH = MODEL_DIR / "pipeline.pkl"
METADATA_PATH = MODEL_DIR / "metadata.json"

MISSING_MODEL_MESSAGE = (
    "Chưa có model đã huấn luyện. Chạy: python -m scripts.train_model"
)


def save_artifacts(model, pipeline, model_name: str, metrics: dict,
                   n_train: int, n_test: int) -> str:
    """Lưu model, pipeline, metadata. Trả về mã phiên bản vừa tạo."""
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    slug = model_name.lower().replace(" ", "_")
    version = f"{slug}_{datetime.now():%Y%m%d_%H%M}"

    joblib.dump(model, MODEL_PATH)
    joblib.dump(pipeline, PIPELINE_PATH)

    metadata = {
        "model_version": version,
        "model_name": model_name,
        "trained_at": datetime.now().isoformat(timespec="seconds"),
        "n_train_samples": n_train,
        "n_test_samples": n_test,
        # Bỏ confusion_matrix và classification_report: chúng là mảng/đoạn văn
        # dài, cần xem thì chạy lại đánh giá.
        "metrics": {k: round(float(v), 4) for k, v in metrics.items()
                    if isinstance(v, (int, float))},
        "pipeline_steps": [name for name, _ in pipeline.steps],
    }
    METADATA_PATH.write_text(json.dumps(metadata, ensure_ascii=False, indent=2),
                             encoding="utf-8")
    return version


def load_artifacts():
    """Nạp (model, pipeline, metadata). Ném FileNotFoundError nếu chưa train."""
    if not MODEL_PATH.exists() or not PIPELINE_PATH.exists():
        raise FileNotFoundError(MISSING_MODEL_MESSAGE)

    model = joblib.load(MODEL_PATH)
    pipeline = joblib.load(PIPELINE_PATH)

    metadata = {}
    if METADATA_PATH.exists():
        metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))

    return model, pipeline, metadata


def artifacts_available() -> bool:
    return MODEL_PATH.exists() and PIPELINE_PATH.exists()
