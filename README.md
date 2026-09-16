# EduGuard AI

Hệ thống dự đoán nguy cơ bỏ học của sinh viên. Phân tích kết quả học tập, chuyên cần
và mức độ tương tác để chỉ ra sinh viên cần được quan tâm, kèm lý do cụ thể để cố vấn
biết nên bắt đầu giúp từ đâu.

**Công nghệ:** Python 3.10+ · Flask 3 · MySQL 8 · SQLAlchemy · scikit-learn · SHAP · Bootstrap 5 · Chart.js

---

## Cài đặt và chạy

Cần có sẵn Python 3.10 trở lên và một MySQL 8 đang chạy.

```powershell
# 1. Môi trường ảo và thư viện
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 2. Cấu hình — mở .env và điền mật khẩu MySQL
copy .env.example .env

# 3. Tạo CSDL (XOÁ và tạo lại CSDL tên eduguard nếu đã có)
mysql -u root -p < database\schema.sql

# 4. Huấn luyện model
python -m scripts.train_model

# 5. Sinh dữ liệu mẫu (tuỳ chọn, nhưng nên làm để có số liệu xem thử)
python -m scripts.seed_demo

# 6. Chạy
python wsgi.py
```

Mở http://127.0.0.1:5000

| Tài khoản | Mật khẩu | Vai trò |
|---|---|---|
| `admin` | `admin123` | Quản trị viên |
| `gv01` … `gv05` | `giangvien123` | Giảng viên, mỗi người phụ trách khoảng 100 sinh viên |
| `sv01` | `sinhvien123` | Sinh viên |

> Đổi toàn bộ mật khẩu mẫu trước khi dùng thật.

---

## Kiến trúc MVC

```
app/
├── models/          M  Thực thể dữ liệu (ORM SQLAlchemy)
├── services/        M  Luật nghiệp vụ và truy vấn
├── templates/       V  Giao diện Jinja2
├── static/          V  CSS, JavaScript
├── controllers/     C  Nhận request, kiểm quyền, điều phối
├── ml/                 Machine learning — đứng ngoài MVC
├── forms.py            Biểu mẫu và ràng buộc kiểm tra phía server
├── security.py         Decorator phân quyền
├── config.py           Cấu hình từ biến môi trường
├── extensions.py       Khởi tạo Flask-SQLAlchemy, Flask-Login, CSRF
├── logging_setup.py    Log tập trung
└── __init__.py         Application factory
```

Luồng một request: **Controller** nhận request và kiểm tra quyền → gọi **Service** (tầng
Model) → service đọc ghi **Model** ORM → controller chọn **View** để render.

Ba ranh giới được giữ chặt:

- **Controller không truy vấn CSDL.** Mọi truy vấn nằm ở `services/`, nên cùng một logic
  dùng được cho giao diện web, REST API và script chạy nền.
- **Service không biết HTTP.** Không import `flask.request`, không trả `Response`.
- **`ml/` không biết CSDL lẫn HTTP.** Nhận số vào, trả số ra — nhờ vậy huấn luyện và kiểm
  thử được hoàn toàn độc lập với ứng dụng web.

REST API cũng là controller, chỉ khác ở chỗ trả JSON, nên nằm trong `controllers/api.py`.

<details>
<summary>Cây thư mục đầy đủ</summary>

```
eduguard/
├── app/
│   ├── controllers/
│   │   ├── public.py         Trang chủ công khai
│   │   ├── auth.py           Đăng nhập, đăng xuất
│   │   ├── students.py       Hồ sơ sinh viên, nhập chỉ số
│   │   ├── predictions.py    Dự đoán, kết quả, lịch sử
│   │   ├── analytics.py      Dashboard, biểu đồ, xuất Excel
│   │   ├── support.py        Biên bản gặp mặt, kế hoạch can thiệp
│   │   ├── imports.py        Nhập CSV/Excel hàng loạt
│   │   └── api.py            REST API
│   ├── models/
│   │   ├── user.py           Tài khoản + luật phân quyền gốc
│   │   ├── student.py
│   │   ├── metrics.py        Kết quả học tập, chuyên cần, tương tác
│   │   ├── prediction.py
│   │   └── support.py        Cố vấn, biên bản gặp mặt, can thiệp
│   ├── services/
│   │   ├── students.py  metrics.py  predictions.py  analytics.py
│   │   ├── reports.py   imports.py  support.py
│   │   └── latest.py         Lấy bản ghi gần nhất hàng loạt, tránh N+1
│   ├── ml/
│   │   ├── features.py       Tên feature và ngưỡng rủi ro — khai báo DUY NHẤT tại đây
│   │   ├── preprocessing.py  Nạp dữ liệu, chia train/test, pipeline biến đổi
│   │   ├── training.py       So sánh 4 thuật toán, chọn model
│   │   ├── registry.py       Lưu, nạp model
│   │   └── predictor.py      Dự đoán và giải thích SHAP
│   ├── templates/
│   │   ├── layout/           base.html, public.html, macros.html
│   │   └── students/ predictions/ analytics/ support/ imports/ auth/ public/ errors/
│   └── static/  css/app.css  js/charts.js
├── database/schema.sql
├── data/raw/dataset_demo_students.csv
├── scripts/  train_model.py  seed_demo.py
├── tests/    test_security.py  test_ml.py  test_services.py  test_api.py
└── wsgi.py
```
</details>

---

## Phân quyền

| | Quản trị viên | Giảng viên | Sinh viên |
|---|:-:|:-:|:-:|
| Dashboard, báo cáo | Toàn hệ thống | Sinh viên mình phụ trách | — |
| Xem hồ sơ, lịch sử dự đoán | Tất cả | Sinh viên mình phụ trách | Chỉ của mình |
| Nhập chỉ số, chạy dự đoán | Tất cả | Sinh viên mình phụ trách | — |
| Xem biên bản gặp mặt, can thiệp | Tất cả | Sinh viên mình phụ trách | Chỉ của mình |
| Ghi biên bản, lập can thiệp | Tất cả | Sinh viên mình phụ trách | — |
| Thêm, sửa, xoá sinh viên | ✓ | — | — |
| Nhập danh sách sinh viên từ file | ✓ | — | — |

Luật gốc nằm ở hai hàm `User.can_view()` và `User.can_edit()` trong `app/models/user.py`.
Mọi nơi khác gọi lại hai hàm này, không tự kiểm tra vai trò — sửa luật chỉ phải sửa một chỗ.

**Trang chủ công khai chỉ hiện số liệu tổng hợp.** Danh sách sinh viên nguy cơ cao, kèm
họ tên và GPA, chỉ hiện cho cán bộ đã đăng nhập: "đang có nguy cơ bỏ học" là thông tin có
thể gây hại cho chính sinh viên nếu lọt ra ngoài.

---

## Model

Bốn thuật toán được huấn luyện và so sánh trên cùng một lần chia dữ liệu. Kết quả thật
trên tập test của dữ liệu mẫu:

| Model | Accuracy | Precision | **Recall** | F1 | ROC-AUC |
|---|---|---|---|---|---|
| **Logistic Regression** | 0.769 | 0.560 | **0.651** | 0.602 | 0.812 |
| Decision Tree | 0.725 | 0.491 | 0.628 | 0.551 | 0.744 |
| Random Forest | 0.794 | 0.679 | 0.442 | 0.535 | 0.797 |
| Gradient Boosting | 0.788 | 0.680 | 0.395 | 0.500 | 0.787 |

**Vì sao chọn theo recall chứ không theo accuracy.** Random Forest có accuracy cao nhất
nhưng chỉ bắt được 44% sinh viên thực sự có nguy cơ. Bỏ sót một sinh viên sắp bỏ học là
hỏng đúng việc hệ thống sinh ra để làm; báo nhầm một sinh viên ổn chỉ tốn thêm một buổi
gặp cố vấn. Hai loại sai này không cùng giá.

**Giới hạn cần biết.** Recall 0.65 nghĩa là model vẫn bỏ sót khoảng 1/3 số sinh viên có
nguy cơ. Script huấn luyện in cảnh báo khi recall dưới 0.70. Dữ liệu mẫu chỉ có 808 dòng;
với dữ liệu thật cần huấn luyện lại và đánh giá lại trước khi dùng. Kết quả dự đoán là căn
cứ để bắt đầu một cuộc trò chuyện, không phải phán quyết.

**Giải thích kết quả** dùng SHAP (`LinearExplainer`), lưu kèm từng lần dự đoán. Giá trị SHAP
nằm trên thang log-odds nên giao diện chỉ thể hiện chiều và độ lớn tương đối, không diễn
giải thành "tăng bao nhiêu phần trăm".

**Bốn mức nguy cơ** theo xác suất, khai báo tại `app/ml/features.py`:

| Thấp | Trung bình | Cao | Rất cao |
|---|---|---|---|
| < 0.30 | 0.30 – 0.60 | 0.60 – 0.80 | ≥ 0.80 |

---

## REST API

Xác thực bằng session cookie (đăng nhập qua giao diện web trước). Mọi phản hồi có dạng
`{"success": true, "data": ...}` hoặc `{"success": false, "error": ...}`.

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/students` | Danh sách sinh viên. Tham số: `keyword`, `status`, `class_name`, `page`, `per_page` (tối đa 100) |
| GET | `/api/students/<id>` | Chi tiết sinh viên kèm lần dự đoán gần nhất |
| POST | `/api/predictions` | Chạy dự đoán. Có `student_id` thì lưu vào lịch sử (201), không có thì chỉ tính (200) |
| GET | `/api/predictions` | Lịch sử dự đoán. Tham số: `student_id`, `page`, `per_page` |
| GET | `/api/statistics` | Tổng số sinh viên và phân bố theo mức nguy cơ |

```json
POST /api/predictions
{
  "student_id": 1,
  "gpa": 5.2, "failed_subjects": 2, "credits_completed": 45, "attendance_rate": 62,
  "login_count": 14, "assignment_submitted": 5, "assignment_missing": 4,
  "forum_posts": 1, "video_views": 18, "learning_hours": 5.5
}
```

Mã lỗi: `400` dữ liệu sai (trả về **toàn bộ** lỗi một lần) · `401` chưa đăng nhập ·
`403` không có quyền · `404` không tìm thấy · `503` chưa huấn luyện model.

**Chưa có:** xác thực bằng API key hoặc JWT cho client gọi từ máy chủ khác.

---

## Kiểm thử

```powershell
pytest
```

66 test, chạy trên SQLite in-memory nên không cần MySQL. Nhóm quan trọng nhất là
`tests/test_security.py`: lỗi phân quyền không bao giờ lộ ra khi dùng thử bằng tài khoản
admin, chỉ có test mới bắt được.

---

## Xử lý sự cố

| Triệu chứng | Nguyên nhân và cách xử lý |
|---|---|
| `Can't connect to MySQL server` | MySQL chưa chạy, hoặc sai `DB_HOST`/`DB_PORT` trong `.env` |
| `Unknown database 'eduguard'` | Chưa chạy `mysql -u root -p < database\schema.sql` |
| Trang dự đoán báo chưa có model | Chạy `python -m scripts.train_model` |
| `#1265 Data truncated for column 'risk_level'` | CSDL được tạo bằng client không dùng UTF-8 nên giá trị ENUM tiếng Việt bị lưu sai. `schema.sql` đã có `SET NAMES utf8mb4` ở đầu — chạy lại file này |
| `AttributeError ... FeatureEngineer` hoặc lỗi khi nạp `model.pkl` | Model được lưu bằng phiên bản mã nguồn hoặc scikit-learn khác. Huấn luyện lại |
| `UnicodeEncodeError: 'charmap' codec` | Console Windows không dùng UTF-8. `app/logging_setup.py` đã tự xử lý; nếu vẫn gặp, chạy `chcp 65001` trước |
| Cổng 5000 đã bị chiếm | Đặt `PORT=5001` trong `.env` |
| Phân bố nguy cơ trên dashboard lệch hẳn về 0% hoặc 100% | Dữ liệu nhập vào nằm ngoài khoảng giá trị model đã học. Đặc biệt kiểm tra `credits_completed` phải là tín chỉ **tích luỹ** (tập huấn luyện tới 140), không phải tín chỉ của riêng một học kỳ |
