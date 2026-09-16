"""
Huấn luyện và so sánh bốn thuật toán, chọn ra model tốt nhất.

Tiêu chí chọn là RECALL chứ không phải accuracy. Bỏ sót một sinh viên sắp bỏ
học (âm tính giả) là hỏng đúng việc hệ thống sinh ra để làm; báo nhầm một
sinh viên ổn (dương tính giả) chỉ tốn thêm một buổi gặp cố vấn. Hai loại sai
này không cùng giá nên không thể tối ưu bằng một thước đo coi chúng ngang nhau.
"""
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score,
                             precision_score, recall_score, roc_auc_score)
from sklearn.tree import DecisionTreeClassifier

from app.logging_setup import get_logger
from app.ml.dataset import RANDOM_STATE, load_training_split
from app.ml.pipeline import build_pipeline

logger = get_logger("ml.training")


def candidate_models() -> dict:
    """
    Bốn ứng viên. Tất cả đặt class_weight='balanced' vì nhãn mất cân bằng:
    không cân lại trọng số, model dễ đạt accuracy cao bằng cách đoán "không
    ai bỏ học cả".

    Gradient Boosting không có tham số này nên được cân bằng gián tiếp qua
    learning_rate thấp và số cây vừa phải.
    """
    return {
        "Logistic Regression": LogisticRegression(
            max_iter=1000, class_weight="balanced", random_state=RANDOM_STATE),
        "Decision Tree": DecisionTreeClassifier(
            max_depth=6, class_weight="balanced", random_state=RANDOM_STATE),
        "Random Forest": RandomForestClassifier(
            n_estimators=300, max_depth=8, class_weight="balanced",
            random_state=RANDOM_STATE, n_jobs=-1),
        "Gradient Boosting": GradientBoostingClassifier(
            n_estimators=200, max_depth=3, learning_rate=0.05,
            random_state=RANDOM_STATE),
    }


def score_model(model, X_test, y_test) -> dict:
    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]

    return {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred, zero_division=0),
        "recall": recall_score(y_test, y_pred, zero_division=0),
        "f1": f1_score(y_test, y_pred, zero_division=0),
        "roc_auc": roc_auc_score(y_test, y_proba),
        "confusion_matrix": confusion_matrix(y_test, y_pred).tolist(),
    }


def train_all():
    """
    Huấn luyện cả bốn model trên cùng một lần chia dữ liệu.

    Trả về (results, pipeline, sizes) với results[tên] = {"model", "metrics"}.
    Pipeline được fit MỘT LẦN trên tập train rồi dùng lại cho mọi model, nên
    model được chọn và pipeline trả về chắc chắn khớp nhau.
    """
    X_train, X_test, y_train, y_test = load_training_split()

    logger.info("Tập train: %d mẫu | tập test: %d mẫu", len(X_train), len(X_test))
    logger.info("Tỷ lệ nhãn dương — train: %.3f | test: %.3f", y_train.mean(), y_test.mean())

    pipeline = build_pipeline()
    X_train_t = pipeline.fit_transform(X_train)
    X_test_t = pipeline.transform(X_test)

    results = {}
    for name, model in candidate_models().items():
        model.fit(X_train_t, y_train)
        metrics = score_model(model, X_test_t, y_test)
        results[name] = {"model": model, "metrics": metrics}

        tn, fp, fn, tp = np.array(metrics["confusion_matrix"]).ravel()
        logger.info(
            "%-20s recall=%.4f  precision=%.4f  f1=%.4f  roc_auc=%.4f  (TN=%d FP=%d FN=%d TP=%d)",
            name, metrics["recall"], metrics["precision"], metrics["f1"],
            metrics["roc_auc"], tn, fp, fn, tp,
        )

    return results, pipeline, (len(X_train), len(X_test))


def comparison_table(results: dict) -> pd.DataFrame:
    """Bảng so sánh để in ra màn hình hoặc đưa vào báo cáo."""
    return pd.DataFrame({
        name: {
            "Accuracy": r["metrics"]["accuracy"],
            "Precision": r["metrics"]["precision"],
            "Recall": r["metrics"]["recall"],
            "F1": r["metrics"]["f1"],
            "ROC-AUC": r["metrics"]["roc_auc"],
        }
        for name, r in results.items()
    }).T.round(4)


def select_best(results: dict, metric: str = "recall"):
    """
    Chọn model có `metric` cao nhất; hoà thì lấy ROC-AUC cao hơn làm trọng tài.

    Không có tiêu chí phụ thì thứ tự khai báo dict quyết định model nào thắng
    khi hoà — một sự ngẫu nhiên không nên ảnh hưởng tới model đưa vào chạy thật.
    """
    best_name = max(
        results,
        key=lambda name: (results[name]["metrics"][metric], results[name]["metrics"]["roc_auc"]),
    )
    return best_name, results[best_name]["model"]
