# database — kết nối MySQL

Mọi thứ cần để dựng và kết nối CSDL, tách khỏi mã backend:

| File | Vai trò |
|---|---|
| `.env.example` | Mẫu cấu hình kết nối — sao chép thành `.env` |
| `.env` | Cấu hình thật (host, cổng, user, mật khẩu). **Không commit** |
| `schema.sql` | Lược đồ 8 bảng. Chạy lại là **xoá sạch** CSDL cùng tên |

## Kết nối

```powershell
cd database
copy .env.example .env        # rồi điền DB_PASSWORD nếu MySQL có mật khẩu
```

Backend đọc cấu hình theo thứ tự ưu tiên, nguồn trước thắng nguồn sau:

1. Biến môi trường của hệ thống
2. `database/.env`
3. `backend/.env` — vẫn đọc `DB_*` ở đây để cấu hình cũ không bị hỏng

`DATABASE_URL` có mặt thì thắng mọi biến `DB_*`.

## Tạo CSDL

Cách 1 — không cần `mysql` trong PATH, dùng đúng cấu hình ở `.env`:

```powershell
cd backend
python main.py init-db
```

Cách 2 — bằng client MySQL:

```powershell
mysql -u root -p < database/schema.sql
# XAMPP: <thư mục xampp>\mysql\bin\mysql.exe -u root < database\schema.sql
```

Cách 3 — phpMyAdmin: tab **Import**, chọn `schema.sql`, bộ ký tự **utf-8**.

`schema.sql` đặt tên CSDL là `eduguard`. `python main.py init-db` tự đổi sang `DB_NAME`;
hai cách còn lại thì phải sửa tên trong file nếu `DB_NAME` khác.
