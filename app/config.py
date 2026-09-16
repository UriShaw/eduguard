"""Cấu hình ứng dụng, đọc từ biến môi trường (file .env)."""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


def _database_url() -> str:
    """
    Chuỗi kết nối CSDL.

    DATABASE_URL (nếu đặt) thắng tất cả — tiện khi cần trỏ sang CSDL khác mà
    không phải sửa 5 biến rời rạc. Không đặt thì ghép từ DB_* cho MySQL.
    """
    url = os.getenv("DATABASE_URL")
    if url:
        return url

    user = os.getenv("DB_USER", "root")
    password = os.getenv("DB_PASSWORD", "")
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "3306")
    name = os.getenv("DB_NAME", "eduguard")
    return f"mysql+pymysql://{user}:{password}@{host}:{port}/{name}?charset=utf8mb4"


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "khoa-mac-dinh-chi-dung-khi-phat-trien")

    SQLALCHEMY_DATABASE_URI = _database_url()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        # Kết nối MySQL bị máy chủ đóng sau wait_timeout (mặc định 8 giờ) vẫn
        # nằm trong pool và sẽ lỗi "MySQL server has gone away" ở lần dùng kế
        # tiếp. pre_ping kiểm tra kết nối trước khi giao, tự thay nếu đã chết.
        "pool_pre_ping": True,
        "pool_recycle": 3600,
    }

    WTF_CSRF_ENABLED = True

    MODEL_DIR = BASE_DIR / "models"
    TRAINING_DATA = BASE_DIR / "data" / "raw" / "dataset_demo_students.csv"


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


class TestingConfig(Config):
    TESTING = True
    DEBUG = False
    # SQLite in-memory để test chạy nhanh và không cần MySQL. Khác biệt duy
    # nhất có ý nghĩa với bộ test hiện tại là SQLite không ép kiểu ENUM.
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    WTF_CSRF_ENABLED = False


CONFIGS = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}


def get_config(name: str | None = None):
    """Trả về lớp config theo tên, mặc định lấy FLASK_ENV."""
    name = name or os.getenv("FLASK_ENV", "development")
    return CONFIGS.get(name, DevelopmentConfig)
