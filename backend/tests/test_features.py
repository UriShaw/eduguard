"""Machine learning, nghiệp vụ và các tính năng mới: hàng loạt, cảnh báo, gợi ý, mô phỏng."""
from datetime import date, datetime, timedelta
from io import BytesIO

import pandas as pd
import pytest

from models import Intervention, Prediction, Student, User
from services import ServiceError, analytics, ml, predictions, reports, students
from tests.conftest import FEATURES, METRICS, login, sid

# ===== Machine learning =====

@pytest.mark.parametrize("p, level", [(0, "Thấp"), (0.2999, "Thấp"), (0.30, "Trung bình"),
                                      (0.60, "Cao"), (0.80, "Rất cao"), (1.0, "Rất cao")])
def test_nguong_phan_muc(p, level):
    assert ml.risk_level_for(p) == level


def test_sinh_vien_te_hon_co_nguy_co_cao_hon():
    """Kiểm tra CHIỀU tác động — model ngược chiều thì mọi con số khác vô nghĩa."""
    good = ml.predict({**FEATURES, "gpa": 9, "failed_subjects": 0, "attendance_rate": 98})
    bad = ml.predict({**FEATURES, "gpa": 3, "failed_subjects": 5, "attendance_rate": 45})
    assert bad["probability"] > good["probability"]


def test_feature_engineer_chuan_hoa_theo_tap_train():
    train = pd.DataFrame([{**FEATURES, "login_count": 40, "video_views": 40, "forum_posts": 10},
                          {**FEATURES, "login_count": 10, "video_views": 10, "forum_posts": 2}])
    engineer = ml.FeatureEngineer().fit(train)
    one = pd.DataFrame([{**FEATURES, "login_count": 10, "video_views": 10, "forum_posts": 2,
                         "assignment_submitted": 0, "assignment_missing": 0}])
    assert engineer.transform(one)["engagement_score"].iloc[0] < 1


def test_du_doan_hang_loat_khop_du_doan_tung_nguoi():
    rows = [FEATURES, {**FEATURES, "gpa": 3.0, "attendance_rate": 40}]
    assert ml.predict_many(rows) == [ml.predict(r)["probability"] for r in rows]


def test_giai_thich_sap_theo_do_anh_huong():
    values = [abs(f["shap_value"]) for f in ml.explain(FEATURES)]
    assert values == sorted(values, reverse=True)


# ===== Nghiệp vụ =====

def _student(db, code="SV001") -> Student:
    return db.get(Student, sid(db, code))


def test_khong_tao_duoc_ma_trung(db):
    with pytest.raises(ServiceError):
        students.save_student(db, {"student_code": "SV001", "full_name": "Trùng"})


def test_email_rong_thanh_null(db):
    a = students.save_student(db, {"student_code": "X1", "full_name": "A", "email": ""})
    b = students.save_student(db, {"student_code": "X2", "full_name": "B", "email": ""})
    assert a.email is None and b.email is None


def test_chi_so_thieu_tra_none_chu_khong_bia(db):
    assert all(v is None for v in students.latest_features(_student(db)).values())


def test_so_buoi_vang_khong_vuot_tong(client, db):
    response = login(client, "admin").post(f"/api/students/{sid(db, 'SV001')}/metrics",
                                          json={**METRICS, "total_sessions": 10, "absent_sessions": 15})
    assert response.status_code == 422


def test_gia_tri_0_hop_le(client, db):
    response = login(client, "admin").post(f"/api/students/{sid(db, 'SV001')}/metrics",
                                          json={**METRICS, "failed_subjects": 0, "forum_posts": 0})
    assert response.status_code == 201


def test_doi_trang_thai_dong_bo_moc_hoan_thanh(db):
    item = students.add_intervention(db, _student(db), {"title": "Phụ đạo"})
    students.set_intervention_status(db, item, "completed")
    assert item.completed_at is not None
    students.set_intervention_status(db, item, "in_progress")
    assert item.completed_at is None


# ===== Dự đoán hàng loạt =====

def test_hang_loat_chi_du_doan_sinh_vien_co_chi_so_moi(db):
    student = _student(db)
    students.record_metrics(db, student, METRICS)

    assert predictions.predict_outdated(db)["predicted"] == 1
    # Chạy lại ngay: chỉ số không đổi nên không nhân bản lịch sử.
    second = predictions.predict_outdated(db)
    assert second["predicted"] == 0 and second["up_to_date"] == 1
    assert db.query(Prediction).count() == 1


# ===== Cảnh báo sớm =====

def _predict(db, code, probability, days_ago):
    db.add(Prediction(student_id=sid(db, code), probability=probability, risk_level=ml.risk_level_for(probability),
                      is_at_risk=probability >= 0.5, model_version="test",
                      created_at=datetime.utcnow() - timedelta(days=days_ago)))
    db.commit()


def test_canh_bao_sinh_vien_xau_di_nhanh(db):
    _predict(db, "SV001", 0.30, days_ago=30)
    _predict(db, "SV001", 0.55, days_ago=1)   # +25 điểm
    _predict(db, "SV002", 0.40, days_ago=30)
    _predict(db, "SV002", 0.45, days_ago=1)   # +5 điểm — dao động bình thường

    worsening = analytics.alerts(db, None)["worsening"]
    assert [w["student_code"] for w in worsening] == ["SV001"]
    assert worsening[0]["delta"] == 25.0


def test_canh_bao_nguy_co_cao_chua_co_ke_hoach(db):
    _predict(db, "SV001", 0.9, days_ago=1)
    _predict(db, "SV002", 0.9, days_ago=1)
    students.add_intervention(db, _student(db, "SV002"), {"title": "Đã có kế hoạch"})

    assert [a["student_code"] for a in analytics.alerts(db, None)["unplanned"]] == ["SV001"]


def test_canh_bao_viec_qua_han(db):
    students.add_intervention(db, _student(db), {"title": "Trễ", "due_date": date.today() - timedelta(days=3)})
    overdue = analytics.alerts(db, None)["overdue"]
    assert overdue[0]["days_overdue"] == 3


def test_thong_ke_chi_tinh_lan_du_doan_gan_nhat(db):
    _predict(db, "SV001", 0.95, days_ago=60)
    _predict(db, "SV001", 0.10, days_ago=1)
    summary = analytics.summary(db, None)
    assert summary["distribution"]["Thấp"] == 1 and summary["distribution"]["Rất cao"] == 0


# ===== Gợi ý can thiệp =====

def test_goi_y_theo_yeu_to_lam_tang_nguy_co():
    factors = [{"feature": "attendance_rate", "label": "Chuyên cần", "effect": "increase"},
               {"feature": "gpa", "label": "GPA", "effect": "decrease"}]
    suggestions = predictions.suggest_interventions(factors)
    assert [s["category"] for s in suggestions] == ["parental_outreach"]


def test_goi_y_bo_qua_loai_viec_dang_mo():
    factors = [{"feature": "attendance_rate", "effect": "increase"}]
    existing = [Intervention(category="parental_outreach", status="in_progress", title="x")]
    assert predictions.suggest_interventions(factors, existing) == []


# ===== Mô phỏng =====

def test_mo_phong_tang_chuyen_can_giam_nguy_co():
    base = {**FEATURES, "attendance_rate": 50}
    result = predictions.simulate(base, {"attendance_rate": 95})
    assert result["delta"] < 0


def test_mo_phong_canh_bao_gia_tri_ngoai_vung_da_hoc():
    result = predictions.simulate(FEATURES, {"login_count": 500})
    assert "Số lần đăng nhập" in result["outside_training_range"]


# ===== Nhập file =====

def _frame(rows):
    return pd.read_csv(BytesIO(pd.DataFrame(rows).to_csv(index=False).encode()))


def test_nhap_sinh_vien_khong_ghi_de_va_bat_trung_trong_file(db):
    result = reports.import_students(db, _frame([
        {"student_code": "SV001", "full_name": "Ghi đè"},
        {"student_code": "SV900", "full_name": "Mới"},
        {"student_code": "SV900", "full_name": "Lặp"},
    ]))
    assert result["imported"] == 1 and len(result["errors"]) == 2
    assert _student(db).full_name == "Sinh Viên A"


def test_giang_vien_nhap_chi_so_nguoi_khac_bao_loi_tung_dong(db):
    lecturer = db.query(User).filter_by(username="gv_a").one()
    result = reports.import_metrics(db, _frame([
        {"student_code": "SV001", "semester": "2025.1", "gpa": 7, "attendance_rate": 80},
        {"student_code": "SV002", "semester": "2025.1", "gpa": 7, "attendance_rate": 80},
    ]), lecturer)
    assert result["imported"] == 1
    assert "không phụ trách" in result["errors"][0]["message"]


# ===== Luồng đầy đủ qua API =====

def test_luong_nhap_chi_so_du_doan_roi_xem_ho_so(client, db):
    login(client, "gv_a")
    student_id = sid(db, "SV001")

    assert client.post(f"/api/students/{student_id}/metrics", json=METRICS).status_code == 201
    assert client.post(f"/api/students/{student_id}/predictions").status_code == 201

    detail = client.get(f"/api/students/{student_id}").json()
    assert detail["prediction"]["risk_level"] in ml.RISK_LEVELS
    assert len(detail["prediction"]["shap_top_factors"]) == 5
    assert detail["trend"][0]["risk"] is not None
    assert client.get("/api/reports/export").status_code == 200
