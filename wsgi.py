"""
Điểm vào của ứng dụng.

Chạy khi phát triển:  python wsgi.py
Chạy thật:            gunicorn "wsgi:app"  (hoặc waitress-serve trên Windows)
"""
from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run(debug=app.config.get("DEBUG", False))
