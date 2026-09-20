"""CRUD đầy đủ: tài khoản, cán bộ tư vấn, gặp mặt, can thiệp, lịch sử chỉ số, dự đoán — kèm phân quyền."""
from tests.conftest import METRICS, PASSWORD, login, sid


def uid(client, username: str) -> int:
    return next(u["user_id"] for u in client.get("/api/users").json() if u["username"] == username)


# ----- Tài khoản -----

def test_admin_tao_sua_xoa_tai_khoan(client):
    login(client, "admin")
    created = client.post("/api/users", json={"username": "gv_moi", "full_name": "GV Mới", "role": "lecturer",
                                              "password": "matkhau456"})
    assert created.status_code == 201, created.text
    user_id = created.json()["user_id"]

    updated = client.put(f"/api/users/{user_id}", json={"username": "gv_moi", "full_name": "GV Đổi Tên",
                                                        "role": "lecturer", "is_active": True})
    assert updated.json()["full_name"] == "GV Đổi Tên"

    client.post("/api/auth/logout")
    login(client, "admin")
    assert client.post("/api/auth/login", json={"username": "gv_moi", "password": "matkhau456"}).status_code == 200, \
        "Sửa hồ sơ mà để trống mật khẩu phải giữ nguyên mật khẩu cũ"

    login(client, "admin")
    assert client.delete(f"/api/users/{user_id}").status_code == 204
    assert all(u["username"] != "gv_moi" for u in client.get("/api/users").json())


def test_tai_khoan_moi_bat_buoc_co_mat_khau(client):
    login(client, "admin")
    response = client.post("/api/users", json={"username": "x", "full_name": "X", "role": "lecturer"})
    assert response.status_code == 400


def test_trung_ten_dang_nhap_bi_tu_choi(client):
    login(client, "admin")
    response = client.post("/api/users", json={"username": "gv_a", "full_name": "Trùng", "role": "lecturer",
                                               "password": "matkhau456"})
    assert response.status_code == 400


def test_admin_khong_tu_khoa_hay_tu_xoa_minh(client):
    login(client, "admin")
    me = uid(client, "admin")
    assert client.delete(f"/api/users/{me}").status_code == 400
    demote = client.put(f"/api/users/{me}", json={"username": "admin", "full_name": "A", "role": "lecturer"})
    assert demote.status_code == 400


def test_tai_khoan_sinh_vien_phai_gan_ho_so_chua_co_tai_khoan(client, db):
    login(client, "admin")
    body = {"username": "sv_b", "full_name": "SV B", "role": "student", "password": "matkhau456"}
    assert client.post("/api/users", json=body).status_code == 400
    assert client.post("/api/users", json={**body, "student_id": sid(db, "SV001")}).status_code == 400
    assert client.post("/api/users", json={**body, "student_id": sid(db, "SV002")}).status_code == 201


def test_xoa_giang_vien_giu_lai_sinh_vien(client, db):
    login(client, "admin")
    assert client.delete(f"/api/users/{uid(client, 'gv_a')}").status_code == 204
    detail = client.get(f"/api/students/{sid(db, 'SV001')}").json()
    assert detail["student"]["advisor_user_id"] is None


def test_giang_vien_khong_quan_ly_duoc_tai_khoan(client):
    login(client, "gv_a")
    assert client.get("/api/users").status_code == 403
    assert client.post("/api/users", json={"username": "x", "full_name": "X", "role": "admin",
                                           "password": "matkhau456"}).status_code == 403


def test_dat_lai_va_tu_doi_mat_khau(client):
    login(client, "admin")
    assert client.post(f"/api/users/{uid(client, 'gv_a')}/password", json={"password": "moi123456"}).status_code == 204
    assert client.post("/api/auth/login", json={"username": "gv_a", "password": "moi123456"}).status_code == 200

    wrong = client.post("/api/auth/password", json={"current_password": "sai", "new_password": "khac123456"})
    assert wrong.status_code == 400
    ok = client.post("/api/auth/password", json={"current_password": "moi123456", "new_password": "khac123456"})
    assert ok.status_code == 204
    assert client.post("/api/auth/login", json={"username": "gv_a", "password": PASSWORD}).status_code == 401


# ----- Cán bộ tư vấn -----

def test_crud_can_bo_tu_van(client):
    login(client, "admin")
    created = client.post("/api/counselors", json={"full_name": "ThS. Tư Vấn", "title": "Chuyên viên"}).json()
    cid = created["counselor_id"]
    assert client.put(f"/api/counselors/{cid}", json={"full_name": "TS. Tư Vấn"}).json()["full_name"] == "TS. Tư Vấn"
    assert client.delete(f"/api/counselors/{cid}").status_code == 204
    assert client.get("/api/counselors").json() == []


def test_giang_vien_chi_xem_can_bo_tu_van(client):
    login(client, "gv_a")
    assert client.get("/api/counselors").status_code == 200
    assert client.post("/api/counselors", json={"full_name": "X"}).status_code == 403


# ----- Gặp mặt và can thiệp -----

def _meeting(client, student_id):
    client.post(f"/api/students/{student_id}/meetings",
                json={"meeting_date": "2026-01-10", "meeting_type": "personal_check_in"})
    return client.get(f"/api/students/{student_id}").json()["meetings"][0]["meeting_id"]


def _intervention(client, student_id):
    client.post(f"/api/students/{student_id}/interventions", json={"title": "Phụ đạo", "category": "peer_tutoring"})
    return client.get(f"/api/students/{student_id}").json()["interventions"][0]["intervention_id"]


def test_sua_xoa_bien_ban_gap_mat(client, db):
    student = sid(db, "SV001")
    login(client, "gv_a")
    meeting = _meeting(client, student)
    body = {"meeting_date": "2026-01-11", "meeting_type": "academic_counseling", "duration_minutes": 45, "notes": "Đã sửa"}
    assert client.put(f"/api/meetings/{meeting}", json=body).status_code == 200
    saved = client.get(f"/api/students/{student}").json()["meetings"][0]
    assert (saved["notes"], saved["duration_minutes"]) == ("Đã sửa", 45)
    assert client.delete(f"/api/meetings/{meeting}").status_code == 204
    assert client.get(f"/api/students/{student}").json()["meetings"] == []


def test_sua_toan_bo_va_xoa_viec_can_thiep(client, db):
    student = sid(db, "SV001")
    login(client, "gv_a")
    item = _intervention(client, student)
    body = {"title": "Phụ đạo Giải tích", "category": "academic_counseling", "status": "completed",
            "due_date": "2026-02-01"}
    assert client.put(f"/api/interventions/{item}", json=body).status_code == 200
    saved = client.get(f"/api/students/{student}").json()["interventions"][0]
    assert (saved["title"], saved["status"]) == ("Phụ đạo Giải tích", "completed")
    assert saved["completed_at"] is not None
    assert client.delete(f"/api/interventions/{item}").status_code == 204


def test_giang_vien_khong_sua_xoa_ban_ghi_cua_sinh_vien_nguoi_khac(client, db):
    other = sid(db, "SV002")
    login(client, "gv_b")
    meeting, item = _meeting(client, other), _intervention(client, other)

    login(client, "gv_a")
    assert client.delete(f"/api/meetings/{meeting}").status_code == 403
    assert client.put(f"/api/meetings/{meeting}", json={"meeting_date": "2026-01-01",
                                                        "meeting_type": "personal_check_in"}).status_code == 403
    assert client.delete(f"/api/interventions/{item}").status_code == 403


def test_sinh_vien_khong_xoa_duoc_gi(client, db):
    student = sid(db, "SV001")
    login(client, "gv_a")
    meeting = _meeting(client, student)
    login(client, "sv_a")
    assert client.delete(f"/api/meetings/{meeting}").status_code == 403


# ----- Lịch sử chỉ số và dự đoán -----

def test_xem_sua_xoa_lich_su_chi_so(client, db):
    student = sid(db, "SV001")
    login(client, "gv_a")
    client.post(f"/api/students/{student}/metrics", json=METRICS)
    client.post(f"/api/students/{student}/metrics", json={**METRICS, "semester": "2025.2", "gpa": 7.0})

    history = client.get(f"/api/students/{student}/metrics").json()
    assert [h["semester"] for h in history] == ["2025.2", "2025.1"], "Mới nhất lên đầu"
    newest = history[0]["result_id"]

    fixed = {**METRICS, "semester": "2025.2", "gpa": 8.2, "attendance_rate": 91.0}
    assert client.put(f"/api/students/{student}/metrics/{newest}", json=fixed).status_code == 200
    features = client.get(f"/api/students/{student}").json()["features"]
    assert (features["gpa"], features["attendance_rate"]) == (8.2, 91.0)

    assert client.delete(f"/api/students/{student}/metrics/{newest}").status_code == 204
    assert len(client.get(f"/api/students/{student}/metrics").json()) == 1


def test_xoa_lan_du_doan(client, db):
    student = sid(db, "SV001")
    login(client, "gv_a")
    client.post(f"/api/students/{student}/metrics", json=METRICS)
    prediction = client.post(f"/api/students/{student}/predictions").json()["prediction_id"]

    login(client, "gv_b")
    assert client.delete(f"/api/predictions/{prediction}").status_code == 403
    login(client, "gv_a")
    assert client.delete(f"/api/predictions/{prediction}").status_code == 204
    assert client.get(f"/api/students/{student}/predictions").json() == []
