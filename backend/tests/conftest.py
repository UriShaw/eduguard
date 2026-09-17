"""
Test chạy trên SQLite in-memory, không cần MySQL.

Dữ liệu dựng sẵn tối thiểu nhưng đủ để kiểm tra phân quyền: hai giảng viên phụ
trách hai sinh viên khác nhau, và một tài khoản sinh viên gắn với một trong hai.
"""
import os

os.environ["DATABASE_URL"] = "sqlite://"  # phải đặt trước khi nạp models

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from controllers.dependencies import get_db  # noqa: E402
from main import app  # noqa: E402
from models import Base, SessionLocal, Student, User, engine  # noqa: E402
from services import ml  # noqa: E402

PASSWORD = "matkhau123"
FEATURES = {"gpa": 6.5, "failed_subjects": 1, "credits_completed": 80, "attendance_rate": 82.0,
            "login_count": 25, "assignment_submitted": 10, "assignment_missing": 2,
            "forum_posts": 4, "video_views": 28, "learning_hours": 12.0}
METRICS = {**FEATURES, "semester": "2025.1", "credits_registered": 18, "total_sessions": 45, "absent_sessions": 8}


@pytest.fixture(scope="session", autouse=True)
def trained_model():
    """Huấn luyện một lần cho cả phiên nếu chưa có — khoảng một giây."""
    if not ml.is_trained():
        ml.train_and_save()


@pytest.fixture
def db():
    Base.metadata.create_all(engine)
    session = SessionLocal()
    users = {name: User(username=name, full_name=name.upper(), role=role)
             for name, role in [("admin", "admin"), ("gv_a", "lecturer"), ("gv_b", "lecturer"), ("sv_a", "student")]}
    for user in users.values():
        user.set_password(PASSWORD)
    session.add_all(users.values())
    session.flush()

    a = Student(student_code="SV001", full_name="Sinh Viên A", class_name="L1", advisor_user_id=users["gv_a"].user_id)
    b = Student(student_code="SV002", full_name="Sinh Viên B", class_name="L2", advisor_user_id=users["gv_b"].user_id)
    session.add_all([a, b])
    session.flush()
    users["sv_a"].student_id = a.student_id
    session.commit()

    yield session

    session.close()
    Base.metadata.drop_all(engine)


@pytest.fixture
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def login(client, username: str):
    response = client.post("/api/auth/login", json={"username": username, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return client


def sid(db, code: str) -> int:
    return db.query(Student).filter_by(student_code=code).one().student_id
