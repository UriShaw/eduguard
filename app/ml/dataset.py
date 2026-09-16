"""Nạp và chia dữ liệu huấn luyện."""
from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split

from app.config import Config
from app.ml.features import RAW_FEATURES, TARGET_COLUMN
from app.logging_setup import get_logger

logger = get_logger("ml.dataset")

RANDOM_STATE = 42
TEST_SIZE = 0.2


def load_dataset(path: Path | str | None = None) -> pd.DataFrame:
    """Đọc CSV huấn luyện và bỏ các dòng trùng lặp hoàn toàn."""
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

    Nhãn mất cân bằng (khoảng 27% dương), chia ngẫu nhiên thuần có thể làm
    tỷ lệ hai tập lệch nhau và khiến số đo trên tập test không so sánh được.
    """
    X = df[RAW_FEATURES].copy()
    y = df[TARGET_COLUMN].copy()
    return train_test_split(X, y, test_size=TEST_SIZE, stratify=y, random_state=RANDOM_STATE)


def drop_outliers(X_train: pd.DataFrame, y_train: pd.Series,
                  column: str = "learning_hours", n_std: float = 4.0):
    """
    Loại điểm dị biệt, CHỈ trên tập train.

    Làm trên tập test sẽ là gian lận: ta sẽ tự bỏ đi những ca khó rồi báo cáo
    số đo đẹp hơn thực tế.
    """
    mean, std = X_train[column].mean(), X_train[column].std()
    keep = ((X_train[column] - mean).abs() / std) <= n_std

    removed = int((~keep).sum())
    if removed:
        logger.info("Loại %d điểm dị biệt ở cột '%s' (chỉ tập train).", removed, column)

    return X_train[keep].reset_index(drop=True), y_train[keep].reset_index(drop=True)


def load_training_split():
    """Gộp ba bước trên thành một lời gọi — dùng ở cả training lẫn explain."""
    df = load_dataset()
    X_train, X_test, y_train, y_test = split_train_test(df)
    X_train, y_train = drop_outliers(X_train, y_train)
    return X_train, X_test, y_train, y_test
