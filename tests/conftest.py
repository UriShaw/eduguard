"""
Fixture dùng chung.

Test chạy trên SQLite in-memory nên không cần MySQL. Mỗi test nhận một CSDL
sạch, dựng sẵn cùng một bộ dữ liệu tối thiểu nhưng đủ để kiểm tra phân quyền:
hai giảng viên phụ trách hai sinh viên khác nhau, và một tài khoản sinh viên
chỉ gắn với một trong hai.
"""
import pytest

from app import create_app
from app.extensions import db as _db
from app.ml.registry import artifacts_available
from app.models import Student, User

PASSWORD = "matkhau123"


@pytest.fixture(scope="session", autouse=True)
def trained_model():
    """
    Bảo đảm có model để test phần dự đoán.

    Huấn luyện một lần cho cả phiên nếu chưa có — mất khoảng một giây trên
    tập dữ liệu mẫu, rẻ hơn nhiều so với việc giả lập model mà vẫn không chắc
    hành vi khớp model thật.
    """
    if not artifacts_available():
        from app.ml.registry import save_artifacts
        from app.ml.training import select_best, train_all

        results, pipeline, (n_train, n_test) = train_all()
        name, model = select_best(results)
        save_artifacts(model, pipeline, name, results[name]["metrics"], n_train, n_test)


@pytest.fixture
def app():
    app = create_app("testing")
    with app.app_context():
        _db.create_all()
        _seed()
        yield app
        _db.session.remove()
        _db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def db(app):
    return _db


def _seed() -> None:
    admin = _user("admin", "admin")
    lecturer_a = _user("gv_a", "lecturer")
    lecturer_b = _user("gv_b", "lecturer")
    _db.session.add_all([admin, lecturer_a, lecturer_b])
    _db.session.flush()

    student_a = Student(student_code="SV001", full_name="Sinh Viên A", class_name="CNTT-01",
                        advisor_user_id=lecturer_a.user_id)
    student_b = Student(student_code="SV002", full_name="Sinh Viên B", class_name="CNTT-02",
                        advisor_user_id=lecturer_b.user_id)
    _db.session.add_all([student_a, student_b])
    _db.session.flush()

    account = _user("sv_a", "student")
    account.student_id = student_a.student_id
    _db.session.add(account)
    _db.session.commit()


def _user(username: str, role: str) -> User:
    user = User(username=username, full_name=username.upper(), role=role)
    user.set_password(PASSWORD)
    return user


def login(client, username: str):
    return client.post("/auth/login", data={"username": username, "password": PASSWORD})


def student_id(code: str) -> int:
    return _db.session.query(Student).filter_by(student_code=code).one().student_id


FEATURES = {
    "gpa": 6.5,
    "failed_subjects": 1,
    "credits_completed": 80,
    "attendance_rate": 82.0,
    "login_count": 25,
    "assignment_submitted": 10,
    "assignment_missing": 2,
    "forum_posts": 4,
    "video_views": 28,
    "learning_hours": 12.0,
}
