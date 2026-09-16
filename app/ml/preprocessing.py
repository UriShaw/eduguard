"""
Chuẩn bị dữ liệu: nạp, chia train/test, loại dị biệt, và pipeline biến đổi.
"""
from pathlib import Path

import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app.config import Config
from app.logging_setup import get_logger
from app.ml.features import ENGINEERED_FEATURES, RAW_FEATURES, TARGET_COLUMN

logger = get_logger("ml.preprocessing")

RANDOM_STATE = 42
TEST_SIZE = 0.2
_EPSILON = 1e-6


# ---------------------------------------------------------------------------
# Nạp và chia dữ liệu
# ---------------------------------------------------------------------------

def load_dataset(path: Path | str | None = None) -> pd.DataFrame:
    """Đọc CSV huấn luyện, bỏ các dòng trùng lặp hoàn toàn."""
    path = Path(path or Config.TRAINING_DATA)
    if not path.exists():
        raise FileNotFoundError(f"Không tìm thấy dữ liệu huấn luyện: {path}")

    df = pd.read_csv(path)
    before = len(df)
    df = df.drop_duplicates()
    if len(df) != before:
        logger.info("Đã bỏ %d dòng trùng lặp.", before - len(df))
    return df


def split_train_test(df: pd.DataFrame):
    """
    Chia train/test có stratify.

    Nhãn mất cân bằng (khoảng 27% dương); chia ngẫu nhiên thuần có thể làm tỷ
    lệ hai tập lệch nhau và số đo trên tập test không còn so sánh được.
    """
    X = df[RAW_FEATURES].copy()
    y = df[TARGET_COLUMN].copy()
    return train_test_split(X, y, test_size=TEST_SIZE, stratify=y, random_state=RANDOM_STATE)


def drop_outliers(X_train: pd.DataFrame, y_train: pd.Series,
                  column: str = "learning_hours", n_std: float = 4.0):
    """
    Loại điểm dị biệt, CHỈ trên tập train.

    Làm cả trên tập test là tự bỏ đi những ca khó rồi báo cáo số đo đẹp hơn
    thực tế.
    """
    mean, std = X_train[column].mean(), X_train[column].std()
    keep = ((X_train[column] - mean).abs() / std) <= n_std

    removed = int((~keep).sum())
    if removed:
        logger.info("Loại %d điểm dị biệt ở cột '%s' (chỉ tập train).", removed, column)

    return X_train[keep].reset_index(drop=True), y_train[keep].reset_index(drop=True)


def load_training_split():
    """Ba bước trên gộp lại — dùng chung cho huấn luyện và giải thích SHAP."""
    X_train, X_test, y_train, y_test = split_train_test(load_dataset())
    X_train, y_train = drop_outliers(X_train, y_train)
    return X_train, X_test, y_train, y_test


# ---------------------------------------------------------------------------
# Pipeline biến đổi
# ---------------------------------------------------------------------------

class FeatureEngineer(BaseEstimator, TransformerMixin):
    """
    Tính ba điểm tổng hợp từ mười chỉ số thô.

    Ba chỉ số tương tác được chuẩn hoá theo giá trị lớn nhất CỦA TẬP HUẤN
    LUYỆN (ghi nhớ trong fit), không theo giá trị lớn nhất của dữ liệu đang dự
    đoán — nếu không, một sinh viên lẻ sẽ tự làm mốc so sánh của chính mình
    và điểm tương tác luôn bằng 1.
    """

    def fit(self, X: pd.DataFrame, y=None):
        self.max_login_ = max(X["login_count"].max(), 1)
        self.max_video_ = max(X["video_views"].max(), 1)
        self.max_forum_ = max(X["forum_posts"].max(), 1)
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X.copy()

        # GPA chiếm 70%, số môn trượt 30%; trượt từ 10 môn trở lên thì phần
        # này về 0 chứ không âm.
        X["academic_score"] = (
            (X["gpa"] / 10) * 0.7
            + (1 - (X["failed_subjects"] / 10).clip(upper=1)) * 0.3
        )

        X["attendance_score"] = X["attendance_rate"] / 100

        submitted_ratio = X["assignment_submitted"] / (
            X["assignment_submitted"] + X["assignment_missing"] + _EPSILON
        )
        X["engagement_score"] = (
            0.40 * submitted_ratio
            + 0.25 * (X["login_count"] / self.max_login_)
            + 0.20 * (X["video_views"] / self.max_video_)
            + 0.15 * (X["forum_posts"] / self.max_forum_)
        )

        return X[RAW_FEATURES + ENGINEERED_FEATURES]


def build_pipeline() -> Pipeline:
    """Pipeline chuẩn — luôn được fit cùng model và lưu cùng model."""
    return Pipeline([
        ("features", FeatureEngineer()),
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])
