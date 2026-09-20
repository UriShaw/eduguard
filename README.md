# EduGuard AI

Hệ thống dự đoán và cảnh báo sớm nguy cơ bỏ học của sinh viên. Phân tích kết quả học tập,
chuyên cần và mức độ tương tác để chỉ ra sinh viên cần được quan tâm — kèm lý do cụ thể và
gợi ý việc cần làm.

| Tầng | Công nghệ |
|---|---|
| Frontend | TypeScript · React 19 · Next.js 16 · Tailwind CSS 4 · shadcn/ui · Framer Motion |
| Backend | Python 3.10+ · FastAPI · SQLAlchemy 2 · scikit-learn · SHAP |
| CSDL | MySQL 8 hoặc MariaDB 10.4+ (MySQL của XAMPP) |

---

## Chạy dự án

Cần có sẵn: **Python 3.10+**, **Node.js 20+**, và **MySQL** đang chạy. MySQL của XAMPP dùng được
ngay — mặc định user `root`, mật khẩu để trống.

### 1. Kết nối MySQL

```powershell
cd database
copy .env.example .env                  # rồi mở .env, điền mật khẩu MySQL (XAMPP: để trống)
```

Thứ tự đọc cấu hình và các cách tạo CSDL khác (client `mysql`, phpMyAdmin) xem ở
[database/README.md](database/README.md).

### 2. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

copy .env.example .env                  # rồi mở .env, đổi SECRET_KEY

python main.py init-db                  # tạo CSDL từ database\schema.sql (XOÁ nếu đã có)
python main.py train                    # huấn luyện model
python main.py seed                     # sinh 500 sinh viên mẫu (tuỳ chọn)
python main.py serve                    # API chạy ở http://127.0.0.1:8000
```

Tài liệu API tương tác: http://127.0.0.1:8000/docs

### 3. Frontend — mở một cửa sổ terminal khác

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
├── database/                Kết nối MySQL, tách khỏi mã nguồn
│   ├── .env.example         Mẫu cấu hình host, cổng, user, mật khẩu — sao chép thành .env
│   └── schema.sql           Lược đồ 8 bảng
│
├── backend/
│   ├── main.py              Điểm vào duy nhất: app FastAPI + lệnh init-db/serve/train/seed/predict-all
│   │
│   ├── models/              M · dữ liệu
│   │   ├── database.py      Đọc database/.env, tạo engine và phiên làm việc, chạy schema.sql
│   │   ├── entities.py      8 bảng ORM và luật phân quyền gốc
│   │   └── schemas.py       Ràng buộc dữ liệu vào/ra (Pydantic)
│   │
│   ├── services/            M · nghiệp vụ
│   │   ├── students.py      Hồ sơ, chỉ số học tập, gặp mặt, can thiệp
│   │   ├── accounts.py      Tài khoản, mật khẩu, cán bộ tư vấn
│   │   ├── predictions.py   Dự đoán, hàng loạt, mô phỏng, gợi ý, xu hướng
│   │   ├── analytics.py     Tổng quan, cảnh báo sớm
│   │   ├── reports.py       Xuất Excel, nhập CSV/Excel
│   │   └── ml.py            Huấn luyện, dự đoán, giải thích SHAP
│   │
│   ├── controllers/         C · nhận request
│   │   ├── dependencies.py  Phiên CSDL, xác thực, phân quyền
│   │   ├── auth.py          Đăng nhập, đăng xuất, đổi mật khẩu
│   │   ├── students.py      Mọi route gắn với một sinh viên
│   │   ├── analytics.py     Tổng quan, cảnh báo, công cụ dữ liệu, báo cáo
│   │   └── admin.py         Tài khoản, cán bộ tư vấn
│   │
│   ├── data/                dataset.csv · seed.py (sinh dữ liệu mẫu)
│   └── tests/               62 test, chạy trên SQLite in-memory
│
└── frontend/                V · giao diện
    └── src/
        ├── app/             Các trang (App Router của Next.js)
        ├── components/
        │   ├── mac/         Khung kiểu macOS: thanh menu, Dock, Spotlight, trung tâm thông báo, hình nền
        │   ├── app-shell    Cửa sổ ứng dụng, thanh bên, thanh công cụ, phím tắt
        │   ├── dialogs      Mọi biểu mẫu thêm/sửa và hộp xác nhận xoá
        │   └── ui/          shadcn, đã phủ lớp kính
        ├── lib/
        │   ├── api.ts         Kiểu dữ liệu và client gọi API
        │   ├── navigation.ts  Một nguồn điều hướng cho Dock, thanh bên, menu, Spotlight
        │   └── preferences.tsx  Giao diện sáng/tối, hình nền, hiệu ứng (lưu trong trình duyệt)
        └── proxy.ts         Chuyển về trang đăng nhập khi chưa có phiên
```

**Mô hình MVC:** `frontend/` là View, `backend/controllers/` là Controller, `backend/models/`
(dữ liệu) cùng `backend/services/` (nghiệp vụ) là Model. Ba ranh giới được giữ chặt:

- **Controller không truy vấn CSDL** — mọi truy vấn nằm trong `services/`.
- **Nghiệp vụ không biết HTTP** — hàm trong `services/` nhận `Session` và dữ liệu thuần,
  nên dùng chung được cho API, lệnh dòng lệnh và bộ test.
- **`services/ml.py` không biết CSDL lẫn HTTP** — nhận số vào, trả số ra, huấn luyện và kiểm thử độc lập.

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
5. Diễn biến qua các học kỳ và bốn danh sách thêm/sửa/xoá được: kế hoạch can thiệp, biên bản
   gặp mặt, lịch sử chỉ số, lịch sử dự đoán

**Dự đoán nhanh** — thử với chỉ số nhập tay, không gắn sinh viên, không lưu.

**Dữ liệu & báo cáo** — sắp theo thứ tự công việc một học kỳ: nhập CSV/Excel → cập nhật dự
đoán hàng loạt → xuất báo cáo Excel.

**Quản trị** — tạo, sửa, khoá, xoá tài khoản; đặt lại mật khẩu; quản lý cán bộ tư vấn.

**Cài đặt** — đổi mật khẩu, chọn giao diện sáng/tối, hình nền và hiệu ứng.

### Giao diện

Giao diện dựng theo macOS với chất liệu kính lỏng: thanh menu trên cùng, cửa sổ có ba nút đèn
giao thông (đỏ khoá màn hình, vàng thu thanh bên, xanh toàn màn hình), Dock phóng to khi rê chuột,
màn hình khoá để đăng nhập. Trên Chrome, Edge và Opera, nền sau Dock và Spotlight còn bị khúc
xạ như nhìn qua kính.

| Phím tắt (Mac / Windows) | Tác dụng |
|---|---|
| `⌘K` / `Ctrl+K` | Spotlight — tìm sinh viên, trang, thao tác |
| `⌥1`…`⌥7` / `Alt+1`…`Alt+7` | Chuyển trang |
| `⌥N` / `Alt+N` | Trung tâm thông báo |
| `⌥S`, `⌥M` / `Alt+S`, `Alt+M` | Ẩn thanh bên, toàn màn hình |
| `⌥L` / `Alt+L` | Khoá màn hình |
| `↑` `↓`, `Space`, `↵` | Trong danh sách sinh viên: chọn, xem nhanh, mở hồ sơ |
| Chuột phải | Menu thao tác trên dòng sinh viên và tài khoản |

### Phân quyền

| | Quản trị viên | Giảng viên | Sinh viên |
|---|:-:|:-:|:-:|
| Tổng quan, cảnh báo, báo cáo | Toàn trường | SV mình phụ trách | — |
| Xem hồ sơ, dự đoán, kế hoạch | Tất cả | SV mình phụ trách | Chỉ của mình |
| Nhập, sửa, xoá chỉ số; chạy, xoá dự đoán; thêm, sửa, xoá kế hoạch và biên bản | Tất cả | SV mình phụ trách | — |
| Thêm, sửa, xoá sinh viên; nhập danh sách | ✓ | — | — |
| Tài khoản, cán bộ tư vấn | ✓ | Chỉ xem cán bộ | — |
| Đổi mật khẩu của chính mình | ✓ | ✓ | ✓ |

Luật gốc nằm ở `User.can_view()` và `User.can_edit()` trong `backend/models/entities.py`;
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
pytest                     # 62 test, không cần MySQL

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
| `Can't connect to MySQL server` | MySQL chưa chạy hoặc sai `DB_HOST`/`DB_PORT` trong `database/.env` |
| API trả 503 "Chưa có model" | Chạy `python main.py train` |
| `#1265 Data truncated for column 'risk_level'` | CSDL được tạo bằng client không dùng UTF-8. `database/schema.sql` đã có `SET NAMES utf8mb4` ở đầu — chạy lại `python main.py init-db` |
| `No module named 'models.ml'` khi nạp model | Model được huấn luyện trước khi đổi cấu trúc thư mục. Chạy lại `python main.py train` |
| `UnicodeEncodeError: 'charmap' codec` | Console Windows không dùng UTF-8; `main.py` đã tự xử lý. Script tự viết thì đặt `PYTHONIOENCODING=utf-8` |
| Đăng nhập được nhưng bị đẩy về trang đăng nhập ngay | `SECRET_KEY` bị đổi sau khi đăng nhập làm token cũ mất hiệu lực — đăng nhập lại |
| Cổng 8000 hoặc 3000 đã bị chiếm | `python main.py serve --port 8001` và đặt `API_URL=http://127.0.0.1:8001` khi chạy frontend; `npm run dev -- -p 3001` |
| Dashboard lệch hẳn về 0% hoặc 100% | Dữ liệu nhập nằm ngoài vùng model đã học — xem mục Giới hạn ở phần Model |
