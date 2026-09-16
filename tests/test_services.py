"""Tầng nghiệp vụ: sinh viên, chỉ số, dự đoán, thống kê, nhập file, can thiệp."""
from datetime import datetime, timedelta
from io import BytesIO

import pandas as pd
import pytest

from app.forms import MetricsForm
from app.models import Prediction, Student, User
from app.services import analytics, imports, metrics, predictions, students, support
from tests.conftest import FEATURES, student_id

SNAPSHOT = {**FEATURES, "semester": "2025.1", "credits_registered": 18,
            "total_sessions": 45, "absent_sessions": 8}


def _student(db, code="SV001") -> Student:
    return db.session.get(Student, student_id(code))


# ----- Sinh viên -----

def test_khong_tao_duoc_hai_sinh_vien_trung_ma(db):
    with pytest.raises(students.StudentError, match="đã tồn tại"):
        students.create({"student_code": "SV001", "full_name": "Trùng mã"})


def test_email_rong_luu_thanh_null_de_khong_vi_pham_unique(db):
    # Hai chuỗi rỗng bị ràng buộc UNIQUE coi là trùng nhau.
    first = students.create({"student_code": "SV101", "full_name": "A", "email": ""})
    second = students.create({"student_code": "SV102", "full_name": "B", "email": ""})
    assert first.email is None and second.email is None


def test_xoa_sinh_vien_xoa_luon_du_lieu_lien_quan(db):
    student = _student(db)
    metrics.record_snapshot(student, SNAPSHOT)
    predictions.run_and_save(student, FEATURES)

    students.delete(student)

    assert db.session.query(Prediction).count() == 0


# ----- Chỉ số -----

def test_ghi_chi_so_tao_dong_thoi_ba_bang(db):
    student = _student(db)
    metrics.record_snapshot(student, SNAPSHOT)

    assert student.latest_academic().gpa == pytest.approx(6.5)
    assert student.latest_attendance().attendance_rate == pytest.approx(82.0)
    assert student.latest_interaction().login_count == 25


def test_chi_so_chua_co_du_lieu_tra_none_chu_khong_bia_so(db):
    snapshot = metrics.latest_features(_student(db))

    assert snapshot["has_data"] is False
    assert all(value is None for value in snapshot["values"].values())


def test_so_buoi_vang_khong_duoc_lon_hon_tong_so_buoi(app):
    with app.test_request_context(method="POST", data={
        **{k: str(v) for k, v in SNAPSHOT.items()}, "total_sessions": "10", "absent_sessions": "15",
    }):
        form = MetricsForm()
        assert form.validate() is False
        assert form.absent_sessions.errors


def test_gia_tri_0_hop_le_voi_input_required(app):
    """DataRequired coi 0 là rỗng — lỗi dễ mắc nhất với biểu mẫu số."""
    with app.test_request_context(method="POST", data={
        **{k: str(v) for k, v in SNAPSHOT.items()},
        "failed_subjects": "0", "assignment_missing": "0", "forum_posts": "0",
    }):
        assert MetricsForm().validate() is True


# ----- Dự đoán -----

def test_du_doan_thu_khong_ghi_vao_csdl(db):
    predictions.run(FEATURES)
    assert db.session.query(Prediction).count() == 0


def test_du_doan_cho_sinh_vien_luu_kem_giai_thich(db):
    record = predictions.run_and_save(_student(db), FEATURES)

    assert record.prediction_id is not None
    assert len(record.shap_top_factors) == 5


def test_lan_du_doan_truoc_la_lan_lien_ke(db):
    student = _student(db)
    first = predictions.run_and_save(student, FEATURES)
    first.created_at = datetime.utcnow() - timedelta(days=30)
    db.session.commit()
    second = predictions.run_and_save(student, FEATURES)

    assert predictions.previous_of(second).prediction_id == first.prediction_id
    assert predictions.previous_of(first) is None


# ----- Thống kê -----

def _prediction(db, code: str, risk: str, days_ago: int):
    db.session.add(Prediction(
        student_id=student_id(code), probability=0.5, risk_level=risk, is_at_risk=True,
        model_version="test", created_at=datetime.utcnow() - timedelta(days=days_ago)))
    db.session.commit()


def test_thong_ke_chi_tinh_lan_du_doan_gan_nhat_cua_moi_sinh_vien(db):
    # SV001 từng "Rất cao" nhưng lần mới nhất là "Thấp" — chỉ được đếm là Thấp.
    _prediction(db, "SV001", "Rất cao", days_ago=60)
    _prediction(db, "SV001", "Rất cao", days_ago=30)
    _prediction(db, "SV001", "Thấp", days_ago=1)

    stats = analytics.summary()

    assert stats["risk_distribution"]["Thấp"] == 1
    assert stats["risk_distribution"]["Rất cao"] == 0
    assert stats["students_predicted"] == 1
    assert stats["students_not_predicted"] == 1


def test_thong_ke_luon_du_bon_muc_ke_ca_muc_rong(db):
    assert set(analytics.summary()["risk_distribution"]) == {"Thấp", "Trung bình", "Cao", "Rất cao"}


def test_thong_ke_cua_giang_vien_chi_tinh_sinh_vien_minh(db):
    _prediction(db, "SV001", "Cao", days_ago=1)
    _prediction(db, "SV002", "Cao", days_ago=1)
    lecturer = db.session.query(User).filter_by(username="gv_a").one()

    assert analytics.summary(lecturer.user_id)["risk_distribution"]["Cao"] == 1
    assert analytics.summary()["risk_distribution"]["Cao"] == 2


# ----- Nhập file -----

def _frame(rows: list[dict]) -> pd.DataFrame:
    return pd.read_csv(BytesIO(pd.DataFrame(rows).to_csv(index=False).encode()))


def test_nhap_sinh_vien_bo_qua_ma_da_ton_tai_chu_khong_ghi_de(db):
    result = imports.import_students(_frame([
        {"student_code": "SV001", "full_name": "Tên mới ghi đè"},
        {"student_code": "SV500", "full_name": "Sinh viên mới"},
    ]))

    assert result["success_count"] == 1
    assert result["error_count"] == 1
    assert _student(db).full_name == "Sinh Viên A"


def test_nhap_sinh_vien_bat_ma_bi_lap_trong_chinh_file(db):
    result = imports.import_students(_frame([
        {"student_code": "SV600", "full_name": "Lần một"},
        {"student_code": "SV600", "full_name": "Lần hai"},
    ]))

    assert result["success_count"] == 1
    assert "lặp" in result["errors"][0]["message"]


def test_nhap_file_thieu_cot_bat_buoc_bao_loi_ca_file(db):
    with pytest.raises(imports.ImportError_, match="full_name"):
        imports.import_students(_frame([{"student_code": "SV700"}]))


def test_giang_vien_nhap_chi_so_cho_sinh_vien_nguoi_khac_bi_bao_loi_tung_dong(db):
    lecturer = db.session.query(User).filter_by(username="gv_a").one()
    result = imports.import_metrics(_frame([
        {"student_code": "SV001", "semester": "2025.1", "gpa": 7, "attendance_rate": 80},
        {"student_code": "SV002", "semester": "2025.1", "gpa": 7, "attendance_rate": 80},
    ]), lecturer)

    assert result["success_count"] == 1
    assert "không phụ trách" in result["errors"][0]["message"]


def test_so_dong_bao_loi_khop_so_dong_trong_excel(db):
    # Dòng 1 là tiêu đề, nên dòng dữ liệu thứ hai nằm ở dòng 3 của file.
    result = imports.import_students(_frame([
        {"student_code": "SV800", "full_name": "Hợp lệ"},
        {"student_code": "SV801", "full_name": ""},
    ]))
    assert result["errors"][0]["row"] == 3


# ----- Can thiệp -----

def test_doi_trang_thai_dong_bo_moc_hoan_thanh(db):
    item = support.create_intervention(_student(db), {"title": "Phụ đạo", "category": "advising"})

    support.set_status(item, "completed")
    assert item.completed_at is not None

    # Mở lại việc đã xong thì mốc hoàn thành cũ phải bị xoá, nếu không bản ghi tự mâu thuẫn.
    support.set_status(item, "in_progress")
    assert item.completed_at is None


def test_can_thiep_gan_voi_lan_du_doan_gan_nhat(db):
    student = _student(db)
    record = predictions.run_and_save(student, FEATURES)

    item = support.create_intervention(student, {"title": "Gặp cố vấn"})

    assert item.prediction_id == record.prediction_id


def test_trang_thai_khong_hop_le_bi_tu_choi(db):
    item = support.create_intervention(_student(db), {"title": "Việc"})
    with pytest.raises(support.SupportError):
        support.set_status(item, "da_xoa")
