"""
Xác thực và phân quyền — nhóm test quan trọng nhất.

Lỗi phân quyền không bao giờ lộ ra khi dùng thử bằng tài khoản admin, chỉ có
test mới bắt được.
"""
import pytest

from tests.conftest import login, sid


def test_chua_dang_nhap_tra_401(client):
    assert client.get("/api/students").status_code == 401


def test_token_gia_bi_tu_choi(client):
    client.cookies.set("eduguard_token", "token.gia.mao")
    assert client.get("/api/auth/me").status_code == 401


def test_sai_ten_va_sai_mat_khau_cung_mot_thong_bao(client):
    wrong_user = client.post("/api/auth/login", json={"username": "khong_co", "password": "x"}).json()
    wrong_pass = client.post("/api/auth/login", json={"username": "admin", "password": "sai"}).json()
    assert wrong_user["detail"] == wrong_pass["detail"]


def test_cookie_dang_nhap_la_httponly(client):
    response = client.post("/api/auth/login", json={"username": "admin", "password": "matkhau123"})
    assert "httponly" in response.headers["set-cookie"].lower()


def test_tai_khoan_bi_khoa_mat_quyen_ngay_du_token_con_han(client, db):
    login(client, "gv_a")
    from models import User
    db.query(User).filter_by(username="gv_a").one().is_active = False
    db.commit()
    assert client.get("/api/auth/me").status_code == 401


def test_dang_xuat_xoa_phien(client):
    login(client, "admin")
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401


# ----- Giảng viên -----

def test_giang_vien_chi_thay_sinh_vien_minh_phu_trach(client):
    data = login(client, "gv_a").get("/api/students").json()
    assert data["total"] == 1
    assert data["items"][0]["student_code"] == "SV001"


def test_giang_vien_khong_xem_duoc_sinh_vien_nguoi_khac(client, db):
    assert login(client, "gv_a").get(f"/api/students/{sid(db, 'SV002')}").status_code == 403


def test_giang_vien_khong_ghi_duoc_cho_sinh_vien_nguoi_khac(client, db):
    login(client, "gv_a")
    other = sid(db, "SV002")
    assert client.post(f"/api/students/{other}/predictions").status_code == 403
    assert client.post(f"/api/students/{other}/interventions", json={"title": "x"}).status_code == 403


def test_du_doan_hang_loat_cua_giang_vien_chi_trong_pham_vi(client, db):
    from tests.conftest import METRICS
    login(client, "admin")
    for code in ("SV001", "SV002"):
        client.post(f"/api/students/{sid(db, code)}/metrics", json=METRICS)

    result = login(client, "gv_a").post("/api/predictions/batch").json()
    assert result["predicted"] == 1


@pytest.mark.parametrize("method, path", [("post", "/api/students"), ("post", "/api/imports/students")])
def test_giang_vien_khong_dung_duoc_chuc_nang_admin(client, method, path):
    login(client, "gv_a")
    assert getattr(client, method)(path, json={}).status_code == 403


# ----- Sinh viên -----

def test_sinh_vien_xem_duoc_ho_so_minh_nhung_khong_sua_duoc(client, db):
    login(client, "sv_a")
    own = sid(db, "SV001")
    detail = client.get(f"/api/students/{own}").json()
    assert detail["can_edit"] is False
    assert detail["suggestions"] == []  # không gợi ý việc mà người xem không được làm
    assert client.post(f"/api/students/{own}/interventions", json={"title": "tự thêm"}).status_code == 403


def test_sinh_vien_khong_xem_duoc_ho_so_nguoi_khac(client, db):
    assert login(client, "sv_a").get(f"/api/students/{sid(db, 'SV002')}").status_code == 403


@pytest.mark.parametrize("path", ["/api/students", "/api/dashboard", "/api/alerts"])
def test_sinh_vien_khong_vao_duoc_trang_can_bo(client, path):
    assert login(client, "sv_a").get(path).status_code == 403


def test_sinh_vien_khong_ton_tai_tra_404(client):
    assert login(client, "admin").get("/api/students/99999").status_code == 404
