# EduGuard AI

Hệ thống dự đoán và cảnh báo sớm nguy cơ bỏ học của sinh viên. Phân tích kết quả học tập,
chuyên cần và mức độ tương tác để chỉ ra sinh viên cần được quan tâm — kèm lý do cụ thể và
gợi ý việc cần làm.

| Tầng | Công nghệ |
|---|---|
| Frontend | TypeScript · React 19 · Next.js 16 · Tailwind CSS 4 · shadcn/ui · Framer Motion |
| Backend | Python 3.10+ · FastAPI · SQLAlchemy 2 · scikit-learn · SHAP |
| CSDL | MySQL 8 |

---

## Chạy dự án

Cần có sẵn: **Python 3.10+**, **Node.js 20+**, và một **MySQL 8** đang chạy.

### 1. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

copy .env.example .env                  # rồi mở .env, điền mật khẩu MySQL và SECRET_KEY

mysql -u root -p < models\schema.sql    # tạo CSDL "eduguard" (XOÁ nếu đã có)
python main.py train                    # huấn luyện model
python main.py seed                     # sinh 500 sinh viên mẫu (tuỳ chọn)
python main.py serve                    # API chạy ở http://127.0.0.1:8000
```

Tài liệu API tương tác: http://127.0.0.1:8000/docs

### 2. Frontend — mở một cửa sổ terminal khác

```powershell
cd frontend
npm install
npm run dev                             # giao diện ở http://localhost:3000
```

Mở **http://localhost:3000** và đăng nhập:

| Tài khoản | Mật khẩu | Vai trò |
|---|---|---|
| `admin` | `admin123` | Quản trị viên — toàn hệ thống |
| `gv01` … `gv05` | `giangvien123` | Giảng viên — mỗi người phụ trách 100 sinh viên |
| `sv01` | `sinhvien123` | Sinh viên — chỉ xem hồ sơ của mình |

> Đổi toàn bộ mật khẩu mẫu và `SECRET_KEY` trước khi dùng thật.

---

## Cấu trúc

```
eduguard/
├── backend/
│   ├── main.py            Điểm vào duy nhất: app FastAPI + lệnh serve/train/seed/predict-all
│   ├── models/            M — dữ liệu và nghiệp vụ
│   │   ├── __init__.py    Kết nối CSDL, 8 thực thể ORM, luật phân quyền gốc
│   │   ├── schemas.py     Ràng buộc dữ liệu vào/ra (Pydantic)
│   │   ├── services.py    Sinh viên, chỉ số, dự đoán, gợi ý, mô phỏng, can thiệp
│   │   ├── analytics.py   Thống kê, cảnh báo sớm, báo cáo Excel, nhập file
│   │   ├── ml.py          Toàn bộ machine learning
│   │   ├── seed.py        Sinh dữ liệu mẫu
│   │   ├── schema.sql     Lược đồ MySQL
│   │   └── dataset.csv    Dữ liệu huấn luyện
│   ├── controllers/       C — route API, xác thực, phân quyền
│   └── tests/             46 test, chạy trên SQLite in-memory
└── frontend/              V — giao diện
    └── src/
        ├── app/           Các trang (App Router)
        ├── components/    Khung ứng dụng, biểu đồ, hộp thoại, mô phỏng; ui/ là shadcn
        ├── lib/api.ts     Kiểu dữ liệu và client gọi API
        └── proxy.ts       Chuyển về trang đăng nhập khi chưa có phiên
```

**Mô hình MVC ở mức hệ thống:** Next.js là View, các router FastAPI là Controller,
`backend/models/` là Model. Ba ranh giới được giữ chặt:

- **Controller không truy vấn CSDL** — mọi truy vấn nằm trong `models/`.
- **Nghiệp vụ không biết HTTP** — hàm trong `services.py` nhận `Session` và dữ liệu thuần,
  nên dùng chung được cho API, lệnh dòng lệnh và bộ test.
- **`ml.py` không biết CSDL lẫn HTTP** — nhận số vào, trả số ra, huấn luyện và kiểm thử độc lập.

**Luồng request:** trình duyệt gọi `/api/*` trên chính máy chủ Next.js, Next chuyển tiếp sang
FastAPI (`next.config.ts`). Vì cùng nguồn, cookie đăng nhập tự đi kèm mà không cần mở CORS.

---

## Chức năng

**Tổng quan** — số sinh viên theo bốn mức nguy cơ, lớp có nhiều sinh viên nguy cơ cao, biểu
đồ học lực và chuyên cần đối chiếu nguy cơ. Nút cập nhật dự đoán hàng loạt.

**Cảnh báo sớm** — trả lời câu hỏi *"hôm nay nên xử lý ai trước"* bằng ba danh sách:

| Danh sách | Điều kiện |
|---|---|
| Đang xấu đi nhanh | Nguy cơ tăng từ 15 điểm phần trăm so với lần dự đoán trước |
| Chưa có kế hoạch | Mức Cao/Rất cao nhưng chưa có việc can thiệp nào đang mở |
| Việc quá hạn | Việc can thiệp đã qua hạn mà chưa xong |

**Hồ sơ sinh viên** — trang trung tâm, theo đúng thứ tự suy nghĩ của cố vấn:
1. *Tình hình:* mức nguy cơ, thay đổi so với lần trước
2. *Vì sao:* các yếu tố đẩy nguy cơ lên hoặc kéo xuống (SHAP)
3. *Nên làm gì:* gợi ý can thiệp suy ra từ các yếu tố đó, thêm vào kế hoạch một chạm
4. *Nếu… thì sao:* kéo thanh trượt để xem nguy cơ giảm bao nhiêu khi cải thiện từng chỉ số
5. Diễn biến qua các học kỳ, kế hoạch can thiệp, biên bản gặp mặt, lịch sử dự đoán

**Dự đoán nhanh** — thử với chỉ số nhập tay, không gắn sinh viên, không lưu.

**Dữ liệu & báo cáo** — sắp theo thứ tự công việc một học kỳ: nhập CSV/Excel → cập nhật dự
đoán hàng loạt → xuất báo cáo Excel.

### Phân quyền

| | Quản trị viên | Giảng viên | Sinh viên |
|---|:-:|:-:|:-:|
| Tổng quan, cảnh báo, báo cáo | Toàn trường | SV mình phụ trách | — |
| Xem hồ sơ, dự đoán, kế hoạch | Tất cả | SV mình phụ trách | Chỉ của mình |
| Nhập chỉ số, chạy dự đoán, lập kế hoạch | Tất cả | SV mình phụ trách | — |
| Thêm, sửa, xoá sinh viên; nhập danh sách | ✓ | — | — |

Luật gốc nằm ở `User.can_view()` và `User.can_edit()` trong `backend/models/__init__.py`;
mọi route đều gọi qua `load_student()` thay vì tự kiểm tra.

---

## Model

Bốn thuật toán được so sánh trên cùng một lần chia dữ liệu. Số đo thật trên tập test:

| Model | Accuracy | Precision | **Recall** | F1 | ROC-AUC |
|---|---|---|---|---|---|
| **Logistic Regression** | 0.769 | 0.560 | **0.651** | 0.602 | 0.812 |
| Decision Tree | 0.725 | 0.491 | 0.628 | 0.551 | 0.744 |
| Random Forest | 0.794 | 0.679 | 0.442 | 0.535 | 0.797 |
| Gradient Boosting | 0.788 | 0.680 | 0.395 | 0.500 | 0.787 |

**Chọn theo recall, không theo accuracy.** Random Forest có accuracy cao nhất nhưng chỉ bắt
được 44% sinh viên thực sự có nguy cơ. Bỏ sót một sinh viên sắp bỏ học là hỏng đúng việc hệ
thống sinh ra để làm; báo nhầm chỉ tốn thêm một buổi gặp cố vấn.

**Giới hạn cần biết:**
- Recall 0.65 nghĩa là model vẫn **bỏ sót khoảng 1/3** sinh viên có nguy cơ.
- Dữ liệu mẫu chỉ có 808 dòng. Với dữ liệu thật phải huấn luyện và đánh giá lại.
- Model thiên về phán quyết cực đoan: ít sinh viên rơi vào hai mức giữa.
- `credits_completed` là tín chỉ **tích luỹ** từ đầu khoá (tập huấn luyện tới 140), không
  phải tín chỉ của riêng một học kỳ. Nhập sai nghĩa sẽ làm dự đoán lệch hoàn toàn.

Kết quả dự đoán là căn cứ để bắt đầu một cuộc trò chuyện, không phải phán quyết.

| Mức | Thấp | Trung bình | Cao | Rất cao |
|---|---|---|---|---|
| Xác suất | < 0.30 | 0.30 – 0.60 | 0.60 – 0.80 | ≥ 0.80 |

---

## Kiểm thử

```powershell
cd backend
pytest                     # 46 test, không cần MySQL

cd ..\frontend
npm run lint
npx tsc --noEmit
```

Nhóm test quan trọng nhất là `tests/test_security.py`: lỗi phân quyền không bao giờ lộ ra
khi dùng thử bằng tài khoản admin, chỉ có test mới bắt được.

---

## Xử lý sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| Frontend báo lỗi khi gọi API / trang trắng sau đăng nhập | Backend chưa chạy. Kiểm tra http://127.0.0.1:8000/api/health |
| `Can't connect to MySQL server` | MySQL chưa chạy hoặc sai `DB_HOST`/`DB_PORT` trong `backend/.env` |
| API trả 503 "Chưa có model" | Chạy `python main.py train` |
| `#1265 Data truncated for column 'risk_level'` | CSDL được tạo bằng client không dùng UTF-8. `schema.sql` đã có `SET NAMES utf8mb4` ở đầu — chạy lại file này |
| `UnicodeEncodeError: 'charmap' codec` | Console Windows không dùng UTF-8; `main.py` đã tự xử lý. Script tự viết thì đặt `PYTHONIOENCODING=utf-8` |
| Đăng nhập được nhưng bị đẩy về trang đăng nhập ngay | `SECRET_KEY` bị đổi sau khi đăng nhập làm token cũ mất hiệu lực — đăng nhập lại |
| Cổng 8000 hoặc 3000 đã bị chiếm | `python main.py serve --port 8001` và đặt `API_URL=http://127.0.0.1:8001` khi chạy frontend; `npm run dev -- -p 3001` |
| Dashboard lệch hẳn về 0% hoặc 100% | Dữ liệu nhập nằm ngoài vùng model đã học — xem mục Giới hạn ở phần Model |
