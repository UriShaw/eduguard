"""
Điểm vào của ứng dụng.

Chạy khi phát triển:  python wsgi.py
Chạy thật:            waitress-serve --port=5000 wsgi:app   (Windows)
                      gunicorn --bind 0.0.0.0:5000 wsgi:app (Linux)
"""
import os

from app import create_app

app = create_app()

if __name__ == "__main__":
    # Cổng đọc từ biến môi trường để chạy song song được với ứng dụng khác
    # đang chiếm cổng mặc định 5000.
    app.run(port=int(os.getenv("PORT", "5000")), debug=app.config.get("DEBUG", False))
