"""
Machine learning: feature, tiền xử lý, huấn luyện, lưu trữ, dự đoán, giải thích.

File này không biết gì về HTTP hay CSDL — nhận số vào, trả số ra. Nhờ vậy nó
huấn luyện và kiểm thử được hoàn toàn độc lập với ứng dụng web.
"""
import logging
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import shap
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score,
                             precision_score, recall_score, roc_auc_score)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

logger = logging.getLogger(__name__)

HERE = Path(__file__).resolve().parent
DATASET_PATH = HERE / "dataset.csv"
# Model, pipeline và metadata lưu CHUNG một tệp. Tách ba tệp thì có thể lỡ
# ghép pipeline của lần huấn luyện này với model của lần khác — dự đoán sai
# mà không báo lỗi gì.
ARTIFACT_PATH = HERE / "trained_model.joblib"

RANDOM_STATE = 42


# ===========================================================================
# Feature và ngưỡng rủi ro — khai báo DUY NHẤT tại đây
# ===========================================================================

FEATURES = {
    "gpa": "Điểm trung bình (GPA)",
    "failed_subjects": "Số môn trượt",
    "credits_completed": "Tín chỉ tích luỹ",
    "attendance_rate": "Tỷ lệ chuyên cần",
    "login_count": "Số lần đăng nhập",
    "assignment_submitted": "Bài tập đã nộp",
    "assignment_missing": "Bài tập còn thiếu",
    "forum_posts": "Bài đăng diễn đàn",
    "video_views": "Lượt xem bài giảng",
    "learning_hours": "Số giờ học trên hệ thống",
}
DERIVED = {
    "academic_score": "Điểm học tập tổng hợp",
    "attendance_score": "Điểm chuyên cần tổng hợp",
    "engagement_score": "Điểm tương tác tổng hợp",
}
RAW_FEATURES = list(FEATURES)
ALL_FEATURES = RAW_FEATURES + list(DERIVED)
LABELS = {**FEATURES, **DERIVED}
TARGET = "dropout_risk"

RISK_THRESHOLDS = [(0.30, "Thấp"), (0.60, "Trung bình"), (0.80, "Cao"), (1.01, "Rất cao")]
RISK_LEVELS = [label for _, label in RISK_THRESHOLDS]
AT_RISK_LEVELS = ("Cao", "Rất cao")


def risk_level_for(probability: float) -> str:
    """Quy xác suất về một trong bốn mức. Cận dưới thuộc về mức trên (0.30 là Trung bình)."""
    if not 0 <= probability <= 1:
        raise ValueError(f"Xác suất {probability} nằm ngoài khoảng [0, 1]")
    return next(label for upper, label in RISK_THRESHOLDS if probability < upper)


# ===========================================================================
# Tiền xử lý
# ===========================================================================

class FeatureEngineer(BaseEstimator, TransformerMixin):
    """
    Tính ba điểm tổng hợp từ mười chỉ số thô.

    Ba chỉ số tương tác chuẩn hoá theo giá trị lớn nhất CỦA TẬP HUẤN LUYỆN,
    ghi nhớ trong fit — không theo dữ liệu đang dự đoán, nếu không một sinh
    viên lẻ tự làm mốc so sánh của mình và điểm tương tác luôn bằng 1.
    """

    def fit(self, X: pd.DataFrame, y=None):
        self.max_login_ = max(X["login_count"].max(), 1)
        self.max_video_ = max(X["video_views"].max(), 1)
        self.max_forum_ = max(X["forum_posts"].max(), 1)
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X.copy()
        X["academic_score"] = (X["gpa"] / 10) * 0.7 + (1 - (X["failed_subjects"] / 10).clip(upper=1)) * 0.3
        X["attendance_score"] = X["attendance_rate"] / 100
        submitted = X["assignment_submitted"] / (X["assignment_submitted"] + X["assignment_missing"] + 1e-6)
        X["engagement_score"] = (0.40 * submitted
                                 + 0.25 * X["login_count"] / self.max_login_
                                 + 0.20 * X["video_views"] / self.max_video_
                                 + 0.15 * X["forum_posts"] / self.max_forum_)
        return X[ALL_FEATURES]


def build_pipeline() -> Pipeline:
    return Pipeline([
        ("features", FeatureEngineer()),
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])


def load_training_split():
    """
    Nạp dữ liệu, chia train/test có stratify, loại dị biệt CHỈ trên tập train.

    - stratify: nhãn mất cân bằng (~27% dương), chia ngẫu nhiên thuần làm tỷ lệ
      hai tập lệch nhau và số đo trên tập test không còn so sánh được.
    - Dị biệt chỉ loại ở train: làm cả trên test là tự bỏ ca khó rồi báo cáo
      số đo đẹp hơn thực tế.
    """
    df = pd.read_csv(DATASET_PATH).drop_duplicates()
    X_train, X_test, y_train, y_test = train_test_split(
        df[RAW_FEATURES], df[TARGET], test_size=0.2, stratify=df[TARGET], random_state=RANDOM_STATE)

    hours = X_train["learning_hours"]
    keep = ((hours - hours.mean()).abs() / hours.std()) <= 4
    return (X_train[keep].reset_index(drop=True), X_test,
            y_train[keep].reset_index(drop=True), y_test)


# ===========================================================================
# Huấn luyện
# ===========================================================================

def candidate_models() -> dict:
    """
    Bốn ứng viên, đều cân lại trọng số lớp: không làm vậy thì model dễ đạt
    accuracy cao bằng cách đoán "không ai bỏ học cả".
    """
    return {
        "Logistic Regression": LogisticRegression(max_iter=1000, class_weight="balanced",
                                                  random_state=RANDOM_STATE),
        "Decision Tree": DecisionTreeClassifier(max_depth=6, class_weight="balanced",
                                                random_state=RANDOM_STATE),
        "Random Forest": RandomForestClassifier(n_estimators=300, max_depth=8, class_weight="balanced",
                                                random_state=RANDOM_STATE, n_jobs=-1),
        "Gradient Boosting": GradientBoostingClassifier(n_estimators=200, max_depth=3,
                                                        learning_rate=0.05, random_state=RANDOM_STATE),
    }


def train_all():
    """Huấn luyện cả bốn trên cùng một lần chia; pipeline fit một lần dùng chung."""
    X_train, X_test, y_train, y_test = load_training_split()
    pipeline = build_pipeline()
    X_train_t = pipeline.fit_transform(X_train)
    X_test_t = pipeline.transform(X_test)

    results = {}
    for name, model in candidate_models().items():
        model.fit(X_train_t, y_train)
        y_pred = model.predict(X_test_t)
        results[name] = {
            "model": model,
            "metrics": {
                "accuracy": accuracy_score(y_test, y_pred),
                "precision": precision_score(y_test, y_pred, zero_division=0),
                "recall": recall_score(y_test, y_pred, zero_division=0),
                "f1": f1_score(y_test, y_pred, zero_division=0),
                "roc_auc": roc_auc_score(y_test, model.predict_proba(X_test_t)[:, 1]),
            },
            "confusion": confusion_matrix(y_test, y_pred).tolist(),
        }
    return results, pipeline, (len(X_train), len(X_test))


def select_best(results: dict) -> str:
    """
    Chọn theo RECALL, hoà thì ROC-AUC làm trọng tài.

    Bỏ sót sinh viên sắp bỏ học là hỏng đúng việc hệ thống sinh ra để làm; báo
    nhầm chỉ tốn thêm một buổi gặp cố vấn. Hai loại sai không cùng giá nên
    không dùng accuracy — thước đo coi chúng ngang nhau.
    """
    return max(results, key=lambda n: (results[n]["metrics"]["recall"], results[n]["metrics"]["roc_auc"]))


def train_and_save() -> dict:
    results, pipeline, (n_train, n_test) = train_all()
    name = select_best(results)

    version = f"{name.lower().replace(' ', '_')}_{datetime.now():%Y%m%d_%H%M}"
    joblib.dump({
        "model": results[name]["model"],
        "pipeline": pipeline,
        "metadata": {
            "version": version, "name": name, "trained_at": datetime.now().isoformat(timespec="seconds"),
            "n_train": n_train, "n_test": n_test,
            "metrics": {k: round(float(v), 4) for k, v in results[name]["metrics"].items()},
        },
    }, ARTIFACT_PATH)
    reset_cache()

    table = pd.DataFrame({n: r["metrics"] for n, r in results.items()}).T.round(4)
    return {"name": name, "version": version, "metrics": results[name]["metrics"], "table": table}


# ===========================================================================
# Dự đoán và giải thích
# ===========================================================================
# Model và explainer nạp một lần rồi giữ trong bộ nhớ: nạp lại mỗi request tốn
# vài trăm mili giây, còn dựng lại explainer phải đọc lại cả tập huấn luyện.

_cache: dict = {}


def reset_cache() -> None:
    _cache.clear()


def is_trained() -> bool:
    return ARTIFACT_PATH.exists()


def _artifact() -> dict:
    if "artifact" not in _cache:
        if not ARTIFACT_PATH.exists():
            raise FileNotFoundError("Chưa có model đã huấn luyện. Chạy: flask --app app train")
        _cache["artifact"] = joblib.load(ARTIFACT_PATH)
    return _cache["artifact"]


def model_info() -> dict:
    return _artifact()["metadata"]


def _frame(features: dict) -> pd.DataFrame:
    missing = [f for f in RAW_FEATURES if features.get(f) is None]
    if missing:
        raise KeyError(f"Thiếu chỉ số: {', '.join(missing)}")
    return pd.DataFrame([{f: float(features[f]) for f in RAW_FEATURES}])


def predict(features: dict) -> dict:
    """{probability, risk_level, is_at_risk, model_version}."""
    art = _artifact()
    X = art["pipeline"].transform(_frame(features))  # chỉ transform, tuyệt đối không fit lại
    probability = float(art["model"].predict_proba(X)[0][1])
    return {
        "probability": round(probability, 4),
        "risk_level": risk_level_for(probability),
        "is_at_risk": bool(art["model"].predict(X)[0]),
        "model_version": art["metadata"]["version"],
    }


def predict_many(rows: list[dict]) -> list[float]:
    """Xác suất cho nhiều bộ chỉ số trong MỘT lần gọi model — dùng cho dự đoán hàng loạt."""
    if not rows:
        return []
    art = _artifact()
    frame = pd.DataFrame([{f: float(r[f]) for f in RAW_FEATURES} for r in rows])
    return [round(float(p), 4) for p in art["model"].predict_proba(art["pipeline"].transform(frame))[:, 1]]


def explain(features: dict, limit: int = 5) -> list[dict]:
    """
    Các yếu tố ảnh hưởng mạnh nhất, sắp theo |SHAP| giảm dần.

    Dùng LinearExplainer vì model là tuyến tính: tính theo công thức đóng, chính
    xác và nhanh hơn KernelExplainer nhiều bậc. Giá trị SHAP ở thang log-odds,
    nên chỉ dùng dấu và độ lớn tương đối, không đọc thành phần trăm.
    """
    art = _artifact()
    pipeline = art["pipeline"]

    if "explainer" not in _cache:
        X_train, *_ = load_training_split()
        background = pipeline.transform(X_train.sample(n=min(100, len(X_train)), random_state=RANDOM_STATE))
        _cache["explainer"] = shap.LinearExplainer(art["model"], background)

    raw = _frame(features)
    values = _cache["explainer"].shap_values(pipeline.transform(raw))[0]
    # Giá trị hiển thị lấy TRƯỚC chuẩn hoá, để người đọc thấy GPA 6.5 chứ không phải z-score.
    shown = pipeline.named_steps["features"].transform(raw).iloc[0]

    factors = [{
        "feature": name,
        "label": LABELS[name],
        "value": round(float(shown[name]), 2),
        "shap_value": round(float(values[i]), 4),
        "effect": "increase" if values[i] > 0 else "decrease",
    } for i, name in enumerate(ALL_FEATURES)]
    factors.sort(key=lambda f: abs(f["shap_value"]), reverse=True)
    return factors[:limit]


def training_ranges() -> dict:
    """
    Khoảng giá trị (min, max) của từng chỉ số trong tập huấn luyện.

    Dùng để giới hạn thanh trượt mô phỏng và cảnh báo khi dữ liệu nhập nằm
    ngoài vùng model đã học — ở đó dự đoán không còn đáng tin.
    """
    if "ranges" not in _cache:
        df = pd.read_csv(DATASET_PATH)
        _cache["ranges"] = {f: (float(np.floor(df[f].min())), float(np.ceil(df[f].max())))
                            for f in RAW_FEATURES}
    return _cache["ranges"]
