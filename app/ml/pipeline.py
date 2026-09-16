"""Pipeline tiền xử lý: tạo feature phái sinh, điền khuyết, chuẩn hoá."""
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app.ml.features import ENGINEERED_FEATURES, RAW_FEATURES

_EPSILON = 1e-6


class FeatureEngineer(BaseEstimator, TransformerMixin):
    """
    Tính ba điểm tổng hợp từ 10 chỉ số thô.

    Ba feature tương tác được chuẩn hoá theo giá trị lớn nhất CỦA TẬP HUẤN
    LUYỆN (học trong fit), không theo giá trị lớn nhất của dữ liệu đang dự
    đoán — nếu không, một sinh viên lẻ sẽ tự trở thành mốc so sánh của chính
    mình và điểm tương tác luôn bằng 1.
    """

    def fit(self, X: pd.DataFrame, y=None):
        self.max_login_ = max(X["login_count"].max(), 1)
        self.max_video_ = max(X["video_views"].max(), 1)
        self.max_forum_ = max(X["forum_posts"].max(), 1)
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X.copy()

        # Học tập: GPA chiếm 70%, số môn trượt 30% (trượt từ 10 môn trở lên
        # thì phần này về 0, không cho âm).
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
    """Pipeline chuẩn, luôn được fit cùng model và lưu cùng model."""
    return Pipeline([
        ("features", FeatureEngineer()),
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])
