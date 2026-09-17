"""
EduGuard AI — backend FastAPI, điểm vào duy nhất.

Kiến trúc MVC:
    models/       M  thực thể, nghiệp vụ, thống kê, machine learning, schema.sql
    controllers/  C  route API, xác thực, phân quyền
    ../frontend/  V  giao diện Next.js

Cách dùng (trong thư mục backend, đã kích hoạt môi trường ảo):
    python main.py serve              chạy API ở http://127.0.0.1:8000
    python main.py train              huấn luyện model
    python main.py seed [--reset]     sinh dữ liệu mẫu
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

    commands.add_parser("train", help="huấn luyện và lưu model")

    seed = commands.add_parser("seed", help="sinh dữ liệu mẫu")
    seed.add_argument("--students", type=int, default=500)
    seed.add_argument("--reset", action="store_true", help="xoá dữ liệu cũ trước khi sinh")

    commands.add_parser("predict-all", help="dự đoán lại cho sinh viên có chỉ số mới")

    args = parser.parse_args()

    if args.command == "serve":
        import uvicorn

        uvicorn.run("main:app", host="127.0.0.1", port=args.port, reload=args.reload)

    elif args.command == "train":
        from models import ml

        report = ml.train_and_save()
        print("\nSo sánh trên tập test:\n", report["table"].to_string(), sep="")
        m = report["metrics"]
        print(f"\nĐã chọn {report['name']} — recall {m['recall']:.3f}, ROC-AUC {m['roc_auc']:.3f}")
        print(f"Phiên bản: {report['version']}")
        if m["recall"] < 0.7:
            print("CẢNH BÁO: recall dưới 0.70 — model bỏ sót hơn 30% sinh viên thực sự có nguy cơ.")

    elif args.command == "seed":
        from models.seed import run

        run(args.students, args.reset)

    elif args.command == "predict-all":
        from models import SessionLocal, services

        with SessionLocal() as db:
            result = services.predict_outdated(db)
        print(f"Đã dự đoán {result['predicted']} sinh viên, {result['up_to_date']} đã cập nhật, "
              f"bỏ qua {result['skipped']} sinh viên thiếu chỉ số.")


if __name__ == "__main__":
    main()
