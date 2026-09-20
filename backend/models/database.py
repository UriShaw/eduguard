"""Kết nối CSDL: đọc cấu hình từ database/.env, tạo engine và phiên làm việc."""
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATABASE_DIR = BACKEND_DIR.parent / "database"
SCHEMA_PATH = DATABASE_DIR / "schema.sql"

# load_dotenv không ghi đè biến đã có, nên file nạp trước thắng. backend/.env vẫn
# được đọc để cấu hình DB_* cũ nằm ở đó không bị hỏng.
load_dotenv(DATABASE_DIR / ".env")
load_dotenv(BACKEND_DIR / ".env")


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


def init_schema() -> str:
    """Chạy database/schema.sql trên MySQL đã cấu hình; trả về tên CSDL vừa tạo lại."""
    import pymysql
    from pymysql.constants import CLIENT

    url = make_url(database_url())
    if not url.drivername.startswith("mysql"):
        raise RuntimeError(f"init-db chỉ dùng cho MySQL, cấu hình hiện tại là {url.drivername}")
    name = url.database or "eduguard"
    # schema.sql đặt cứng tên eduguard; đổi theo DB_NAME để tạo đúng CSDL backend sẽ dùng.
    sql = re.sub(r"\b(DATABASE(?: IF EXISTS)?|USE) eduguard\b", rf"\1 `{name}`",
                 SCHEMA_PATH.read_text(encoding="utf-8"))
    connection = pymysql.connect(host=url.host or "localhost", port=url.port or 3306,
                                 user=url.username or "root", password=url.password or "",
                                 charset="utf8mb4", client_flag=CLIENT.MULTI_STATEMENTS)
    try:
        with connection.cursor() as cursor:
            cursor.execute(sql)
            while cursor.nextset():  # lỗi ở câu lệnh sau chỉ lộ ra khi đọc tới kết quả của nó
                pass
        connection.commit()
    finally:
        connection.close()
    return name
