"""Kết nối CSDL: đọc cấu hình từ .env, tạo engine và phiên làm việc."""
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def database_url() -> str:
    """DATABASE_URL thắng tất cả; không có thì ghép từ các biến DB_*."""
    if os.getenv("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    return (f"mysql+pymysql://{os.getenv('DB_USER', 'root')}:{os.getenv('DB_PASSWORD', '')}"
            f"@{os.getenv('DB_HOST', 'localhost')}:{os.getenv('DB_PORT', '3306')}"
            f"/{os.getenv('DB_NAME', 'eduguard')}?charset=utf8mb4")


def make_engine(url: str | None = None):
    url = url or database_url()
    if url.startswith("sqlite"):
        from sqlalchemy.pool import StaticPool

        return create_engine(url, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    # pre_ping: kết nối nhàn rỗi quá wait_timeout của MySQL vẫn nằm trong pool
    # và sẽ lỗi "server has gone away" ở lần dùng kế tiếp nếu không kiểm tra trước.
    return create_engine(url, pool_pre_ping=True, pool_recycle=3600)


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass
