"""
EduGuard AI — backend FastAPI, điểm vào duy nhất.

Kiến trúc MVC:
    models/       M  dữ liệu: kết nối CSDL, thực thể ORM, lược đồ vào/ra
    services/     M  nghiệp vụ: sinh viên, dự đoán, thống kê, báo cáo, machine learning
    controllers/  C  route API, xác thực, phân quyền
    data/            dữ liệu huấn luyện (dataset.csv)
    ../database/     cấu hình kết nối MySQL (.env), lược đồ schema.sql, dữ liệu mẫu seed.sql
    ../frontend/  V  giao diện Next.js

Cách dùng (trong thư mục backend, đã kích hoạt môi trường ảo):
    python main.py init-db            tạo lại CSDL từ ../database/schema.sql (XOÁ dữ liệu cũ)
    python main.py serve              chạy API ở http://127.0.0.1:8000
    python main.py train              huấn luyện model
    python main.py seed               nạp dữ liệu mẫu từ ../database/seed.sql
    python main.py predict-all        dự đoán lại cho mọi sinh viên có chỉ số mới
"""
import argparse
import logging
import os
import sys

# Console Windows mặc định cp1258, không mã hoá đủ tiếng Việt có dấu: mọi lệnh
# print/log tiếng Việt ném UnicodeEncodeError. Phải xử lý trước mọi thứ khác.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from controllers import register  # noqa: E402

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"),
                    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s")

app = FastAPI(title="EduGuard AI", version="2.0",
              description="API dự đoán nguy cơ bỏ học của sinh viên")

# Trình duyệt gọi API qua proxy cùng nguồn của Next.js nên không cần CORS.
# Chỉ mở cho địa chỉ khai báo tường minh (vd khi chạy frontend ở máy khác).
origins = [o for o in os.getenv("CORS_ORIGINS", "").split(",") if o]
if origins:
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"])

register(app)


def main() -> None:
    parser = argparse.ArgumentParser(description="EduGuard AI backend")
    commands = parser.add_subparsers(dest="command", required=True)

    serve = commands.add_parser("serve", help="chạy máy chủ API")
    serve.add_argument("--port", type=int, default=int(os.getenv("PORT", "8000")))
    serve.add_argument("--reload", action="store_true", help="tự nạp lại khi sửa mã")

    init_db = commands.add_parser("init-db", help="tạo lại CSDL từ database/schema.sql")
    init_db.add_argument("--yes", action="store_true", help="không hỏi xác nhận")

    commands.add_parser("train", help="huấn luyện và lưu model")

    commands.add_parser("seed", help="nạp dữ liệu mẫu từ database/seed.sql")

    commands.add_parser("predict-all", help="dự đoán lại cho sinh viên có chỉ số mới")

    args = parser.parse_args()

    if args.command == "serve":
        import uvicorn

        uvicorn.run("main:app", host="127.0.0.1", port=args.port, reload=args.reload)

    elif args.command == "init-db":
        from models.database import init_schema

        if not args.yes and input("Mọi dữ liệu cũ trong CSDL sẽ bị XOÁ. Tiếp tục? [y/N] ").lower() != "y":
            return
        print(f"Đã tạo lại CSDL {init_schema()}. Tiếp theo: python main.py seed")

    elif args.command == "train":
        from services import ml

        report = ml.train_and_save()
        print("\nSo sánh trên tập test:\n", report["table"].to_string(), sep="")
        m = report["metrics"]
        print(f"\nĐã chọn {report['name']} — recall {m['recall']:.3f}, ROC-AUC {m['roc_auc']:.3f}")
        print(f"Phiên bản: {report['version']}")
        if m["recall"] < 0.7:
            print("CẢNH BÁO: recall dưới 0.70 — model bỏ sót hơn 30% sinh viên thực sự có nguy cơ.")

    elif args.command == "seed":
        import pymysql
        from pymysql.constants import CLIENT
        from sqlalchemy import make_url
        from models.database import database_url, DATABASE_DIR

        seed_path = DATABASE_DIR / "seed.sql"
        if not seed_path.exists():
            print(f"Không tìm thấy {seed_path}")
            return
        sql = seed_path.read_text(encoding="utf-8")
        url = make_url(database_url())
        connection = pymysql.connect(
            host=url.host or "localhost", port=url.port or 3306,
            user=url.username or "root", password=url.password or "",
            charset="utf8mb4", client_flag=CLIENT.MULTI_STATEMENTS,
        )
        try:
            with connection.cursor() as cursor:
                cursor.execute(sql)
                while cursor.nextset():
                    pass
            connection.commit()
        finally:
            connection.close()
        print("Đã nạp dữ liệu mẫu từ database/seed.sql."
              "\nTài khoản: admin/admin123 · gv01…gv05/giangvien123 · sv01/sinhvien123"
              "\nTiếp theo: python main.py train && python main.py predict-all")

    elif args.command == "predict-all":
        from models import SessionLocal
        from services import predictions

        with SessionLocal() as db:
            result = predictions.predict_outdated(db)
        print(f"Đã dự đoán {result['predicted']} sinh viên, {result['up_to_date']} đã cập nhật, "
              f"bỏ qua {result['skipped']} sinh viên thiếu chỉ số.")


if __name__ == "__main__":
    main()
