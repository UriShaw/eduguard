"""REST API: định dạng phản hồi, kiểm tra dữ liệu gửi lên, và luồng dự đoán."""
from app.models import Prediction
from tests.conftest import FEATURES, login, student_id


def test_moi_phan_hoi_co_cung_khung_success_data(client):
    login(client, "admin")
    body = client.get("/api/statistics").get_json()

    assert body["success"] is True
    assert "data" in body


def test_kiem_tra_du_lieu_tra_ve_het_loi_mot_lan(client):
    """Trả lỗi đầu tiên gặp phải bắt client sửa từng cái qua nhiều lượt gọi."""
    login(client, "admin")
    payload = {**FEATURES, "gpa": 15, "attendance_rate": 150, "forum_posts": -1}

    response = client.post("/api/predictions", json=payload)
    errors = response.get_json()["error"]

    assert response.status_code == 400
    assert len(errors) == 3


def test_thieu_truong_bao_ro_ten_truong(client):
    login(client, "admin")
    payload = {k: v for k, v in FEATURES.items() if k != "gpa"}

    errors = client.post("/api/predictions", json=payload).get_json()["error"]

    assert any("gpa" in e for e in errors)


def test_than_request_khong_phai_json_bi_tu_choi(client):
    login(client, "admin")
    response = client.post("/api/predictions", data="khong phai json",
                           content_type="text/plain")
    assert response.status_code == 400


def test_du_doan_khong_kem_sinh_vien_khong_luu(client, db):
    login(client, "admin")
    response = client.post("/api/predictions", json=FEATURES)

    assert response.status_code == 200
    assert db.session.query(Prediction).count() == 0


def test_du_doan_kem_sinh_vien_luu_va_tra_201(client, db):
    login(client, "admin")
    response = client.post("/api/predictions",
                           json={**FEATURES, "student_id": student_id("SV001")})

    assert response.status_code == 201
    assert db.session.query(Prediction).count() == 1


def test_giang_vien_khong_du_doan_duoc_qua_api_cho_sinh_vien_nguoi_khac(client, db):
    login(client, "gv_a")
    response = client.post("/api/predictions",
                           json={**FEATURES, "student_id": student_id("SV002")})

    assert response.status_code == 403
    assert db.session.query(Prediction).count() == 0


def test_kich_thuoc_trang_bi_gioi_han(client):
    login(client, "admin")
    data = client.get("/api/students?per_page=100000").get_json()["data"]
    assert data["total"] == 2  # vẫn chạy được, không lỗi và không trả vô hạn
