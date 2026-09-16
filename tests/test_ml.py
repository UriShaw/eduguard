"""Tầng machine learning — chạy độc lập, không cần CSDL hay ngữ cảnh Flask."""
import pandas as pd
import pytest

from app.ml import predictor
from app.ml.features import RISK_LEVELS, risk_level_for
from app.ml.preprocessing import FeatureEngineer, drop_outliers
from app.ml.training import select_best
from tests.conftest import FEATURES


@pytest.mark.parametrize("probability, expected", [
    (0.0, "Thấp"),
    (0.2999, "Thấp"),
    (0.30, "Trung bình"),     # cận dưới thuộc về mức trên
    (0.5999, "Trung bình"),
    (0.60, "Cao"),
    (0.80, "Rất cao"),
    (1.0, "Rất cao"),         # giá trị tối đa vẫn phải có mức
])
def test_nguong_phan_muc_nguy_co(probability, expected):
    assert risk_level_for(probability) == expected


def test_xac_suat_ngoai_khoang_bi_tu_choi():
    with pytest.raises(ValueError):
        risk_level_for(1.5)


def test_feature_engineer_chuan_hoa_theo_tap_train_chu_khong_theo_du_lieu_moi():
    """
    Lỗi kinh điển: chuẩn hoá theo max của chính dữ liệu đang dự đoán thì một
    sinh viên lẻ tự làm mốc của mình, điểm tương tác luôn bằng 1.
    """
    train = pd.DataFrame([
        {**FEATURES, "login_count": 40, "video_views": 40, "forum_posts": 10},
        {**FEATURES, "login_count": 10, "video_views": 10, "forum_posts": 2},
    ])
    engineer = FeatureEngineer().fit(train)

    one_student = pd.DataFrame([{**FEATURES, "login_count": 10, "video_views": 10, "forum_posts": 2,
                                 "assignment_submitted": 0, "assignment_missing": 0}])
    score = engineer.transform(one_student)["engagement_score"].iloc[0]

    assert score == pytest.approx(0.25 * 10 / 40 + 0.20 * 10 / 40 + 0.15 * 2 / 10, abs=1e-3)
    assert score < 1


def test_loai_di_biet_chi_bo_diem_cuc_doan():
    X = pd.DataFrame({"learning_hours": [10.0] * 50 + [9999.0]})
    y = pd.Series([0] * 51)

    X_kept, y_kept = drop_outliers(X, y)

    assert len(X_kept) == 50
    assert 9999.0 not in X_kept["learning_hours"].values
    assert len(X_kept) == len(y_kept)


def test_chon_model_hoa_recall_thi_lay_roc_auc_lam_trong_tai():
    results = {
        "A": {"model": "a", "metrics": {"recall": 0.7, "roc_auc": 0.75}},
        "B": {"model": "b", "metrics": {"recall": 0.7, "roc_auc": 0.82}},
    }
    assert select_best(results)[0] == "B"


def test_du_doan_tra_ve_dung_cau_truc():
    result = predictor.predict(FEATURES)

    assert 0 <= result["probability"] <= 1
    assert result["risk_level"] in RISK_LEVELS
    assert result["risk_level"] == risk_level_for(result["probability"])
    assert isinstance(result["is_at_risk"], bool)
    assert result["model_version"]


def test_sinh_vien_te_hon_co_nguy_co_cao_hon():
    """Kiểm tra hướng tác động — model ngược chiều thì mọi con số khác đều vô nghĩa."""
    good = predictor.predict({**FEATURES, "gpa": 9.0, "failed_subjects": 0, "attendance_rate": 98})
    bad = predictor.predict({**FEATURES, "gpa": 3.0, "failed_subjects": 5, "attendance_rate": 45})
    assert bad["probability"] > good["probability"]


def test_thieu_chi_so_bao_ro_ten_chi_so():
    incomplete = {k: v for k, v in FEATURES.items() if k != "gpa"}
    with pytest.raises(KeyError, match="gpa"):
        predictor.predict(incomplete)


def test_giai_thich_sap_theo_do_anh_huong_giam_dan():
    factors = predictor.explain(FEATURES, limit=5)

    assert len(factors) == 5
    magnitudes = [abs(f["shap_value"]) for f in factors]
    assert magnitudes == sorted(magnitudes, reverse=True)
    for f in factors:
        assert f["effect"] == ("increase" if f["shap_value"] > 0 else "decrease")
        assert f["label"]
