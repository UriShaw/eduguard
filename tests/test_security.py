"""
Phân quyền — nhóm test quan trọng nhất của dự án.

Lỗi phân quyền không hiện ra khi dùng thử bằng tài khoản admin, nên chỉ có
test mới bắt được. Mỗi test ở đây tương ứng một câu hỏi cụ thể: "người này có
làm được việc kia không".
"""
import pytest

from tests.conftest import login, student_id


# ----- Chưa đăng nhập -----

def test_trang_noi_bo_chuyen_ve_dang_nhap(client):
    response = client.get("/students/")
    assert response.status_code == 302
    assert "/auth/login" in response.headers["Location"]


def test_api_chua_dang_nhap_tra_401_json_chu_khong_chuyen_huong(client):
    # Chuyển hướng 302 kèm HTML làm client API không phân biệt được
    # "chưa đăng nhập" với "thành công".
    response = client.get("/api/statistics")
    assert response.status_code == 401
    assert response.is_json
    assert response.get_json()["success"] is False


def test_trang_chu_khong_lo_ten_sinh_vien_khi_chua_dang_nhap(client):
    html = client.get("/").get_data(as_text=True)
    assert "Sinh Viên A" not in html
    assert "SV001" not in html


def test_bieu_do_theo_lop_bi_an_khi_chua_dang_nhap(client):
    # Một lớp ít người thì số đếm theo lớp gần như chỉ đích danh.
    data = client.get("/home-chart-data").get_json()["data"]
    assert data["by_class"] == {"labels": [], "values": []}


# ----- Đăng nhập -----

def test_sai_ten_va_sai_mat_khau_cung_mot_thong_bao(client):
    wrong_user = client.post("/auth/login", data={"username": "khong_ton_tai", "password": "x"},
                             follow_redirects=True).get_data(as_text=True)
    wrong_pass = client.post("/auth/login", data={"username": "admin", "password": "sai"},
                             follow_redirects=True).get_data(as_text=True)

    message = "Tên đăng nhập hoặc mật khẩu không đúng."
    assert message in wrong_user
    assert message in wrong_pass


@pytest.mark.parametrize("target", ["https://trang-gia-mao.com", "//trang-gia-mao.com"])
def test_tham_so_next_khong_cho_chuyen_huong_ra_ngoai(client, target):
    response = client.post(f"/auth/login?next={target}",
                           data={"username": "admin", "password": "matkhau123"})
    assert response.status_code == 302
    assert "trang-gia-mao" not in response.headers["Location"]


def test_tham_so_next_noi_bo_van_hoat_dong(client):
    response = client.post("/auth/login?next=/students/",
                           data={"username": "admin", "password": "matkhau123"})
    assert response.headers["Location"].endswith("/students/")


# ----- Giảng viên -----

def test_giang_vien_xem_duoc_sinh_vien_minh_phu_trach(client):
    login(client, "gv_a")
    assert client.get(f"/students/{student_id('SV001')}").status_code == 200


def test_giang_vien_khong_xem_duoc_sinh_vien_nguoi_khac(client):
    login(client, "gv_a")
    assert client.get(f"/students/{student_id('SV002')}").status_code == 403


def test_giang_vien_khong_du_doan_duoc_cho_sinh_vien_nguoi_khac(client):
    login(client, "gv_a")
    assert client.get(f"/predictions/students/{student_id('SV002')}").status_code == 403


def test_giang_vien_chi_thay_sinh_vien_minh_qua_api(client):
    login(client, "gv_a")
    data = client.get("/api/students").get_json()["data"]
    assert data["total"] == 1
    assert data["students"][0]["student_code"] == "SV001"


@pytest.mark.parametrize("path", ["/students/new", "/imports/students"])
def test_giang_vien_khong_vao_duoc_chuc_nang_chi_danh_cho_admin(client, path):
    login(client, "gv_a")
    assert client.get(path).status_code == 403


# ----- Sinh viên -----

def test_sinh_vien_xem_duoc_ho_so_cua_minh(client):
    login(client, "sv_a")
    assert client.get(f"/students/{student_id('SV001')}").status_code == 200


def test_sinh_vien_khong_xem_duoc_ho_so_nguoi_khac(client):
    login(client, "sv_a")
    assert client.get(f"/students/{student_id('SV002')}").status_code == 403


def test_sinh_vien_xem_duoc_ke_hoach_can_thiep_cua_minh_nhung_khong_sua_duoc(client):
    login(client, "sv_a")
    sid = student_id("SV001")

    assert client.get(f"/support/{sid}/interventions").status_code == 200
    response = client.post(f"/support/{sid}/interventions",
                           data={"category": "other", "title": "Tự thêm"})
    assert response.status_code == 403


def test_sinh_vien_khong_tu_nhap_chi_so_cho_minh(client):
    login(client, "sv_a")
    assert client.get(f"/students/{student_id('SV001')}/metrics").status_code == 403


@pytest.mark.parametrize("path", ["/analytics/dashboard", "/predictions/", "/api/students"])
def test_sinh_vien_khong_vao_duoc_trang_danh_cho_can_bo(client, path):
    login(client, "sv_a")
    assert client.get(path).status_code == 403


# ----- Chung -----

def test_sinh_vien_khong_ton_tai_tra_404(client):
    login(client, "admin")
    assert client.get("/students/999999").status_code == 404
