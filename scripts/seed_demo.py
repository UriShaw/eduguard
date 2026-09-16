"""
Sinh dữ liệu mẫu cho toàn hệ thống.

    python -m scripts.seed_demo                # 500 sinh viên
    python -m scripts.seed_demo --students 100
    python -m scripts.seed_demo --reset        # xoá dữ liệu cũ rồi sinh lại

Dữ liệu ngẫu nhiên nhưng CÓ CẤU TRÚC: mỗi sinh viên được gán một hồ sơ học
tập tiềm ẩn, mọi chỉ số sinh quanh hồ sơ đó và biến động dần qua từng kỳ.
Nhờ vậy dashboard và biểu đồ cho ra bức tranh hợp lý thay vì nhiễu trắng.

QUAN TRỌNG — các khoảng giá trị trong PROFILES bám sát phân phối của tập
huấn luyện. Model có StandardScaler fit trên tập đó; sinh dữ liệu nằm ngoài
khoảng đã học sẽ tạo z-score cực lớn và đẩy xác suất về 0 hoặc 1, khiến
dashboard báo phân bố nguy cơ sai lệch hoàn toàn. Đổi dataset huấn luyện thì
phải xem lại các khoảng này.
"""
import argparse
import random
from datetime import date, datetime, timedelta

from app import create_app
from app.extensions import db
from app.ml import predictor
from app.models import (AcademicResult, Attendance, Counselor, Intervention,
                        LearningInteraction, MeetingLog, Prediction, Student,
                        User)

SEED = 42
DEFAULT_STUDENTS = 500

# Ba học kỳ gần nhất: (tên kỳ, ngày bắt đầu, ngày kết thúc)
SEMESTERS = [
    ("2024.2", date(2025, 1, 6), date(2025, 5, 30)),
    ("2025.1", date(2025, 8, 18), date(2025, 12, 26)),
    ("2025.2", date(2026, 1, 5), date(2026, 5, 29)),
]

SURNAMES = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ",
            "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý", "Đinh"]
MIDDLE_M = ["Văn", "Hữu", "Đức", "Minh", "Quang", "Thanh", "Công", "Xuân", "Tuấn"]
MIDDLE_F = ["Thị", "Ngọc", "Thanh", "Thu", "Minh", "Phương", "Kim", "Khánh", "Mai"]
GIVEN_M = ["An", "Bình", "Cường", "Dũng", "Đạt", "Hải", "Hùng", "Khoa", "Long",
           "Nam", "Phúc", "Quân", "Sơn", "Thắng", "Trung", "Tú", "Vinh", "Hiếu"]
GIVEN_F = ["Anh", "Chi", "Dung", "Giang", "Hà", "Hạnh", "Hoa", "Huyền", "Lan",
           "Linh", "Mai", "Ngân", "Nhung", "Quỳnh", "Thảo", "Trang", "Vy", "Yến"]

MAJORS = [
    ("CNTT", "Công nghệ thông tin"),
    ("KTPM", "Kỹ thuật phần mềm"),
    ("QTKD", "Quản trị kinh doanh"),
    ("KETO", "Kế toán"),
    ("NNA", "Ngôn ngữ Anh"),
    ("DTVT", "Điện tử viễn thông"),
]
ENROLLMENT_YEARS = [2022, 2023, 2024, 2025]

# Hồ sơ học tập tiềm ẩn. Các khoảng bám sát phân phối tập huấn luyện:
# gpa 2.0–10, failed 0–6, attendance 37–100, login 11–41, submitted 2–21,
# missing 0–9, forum 0–11, video 16–44, learning_hours 0–185 (lệch phải).
PROFILES = [
    {"name": "tốt", "weight": 0.42,
     "gpa": (7.2, 9.5), "failed": (0, 0), "credit_ratio": (0.92, 1.00),
     "attendance": (86, 99.5), "login": (26, 41), "submitted": (10, 18),
     "missing": (0, 1), "forum": (4, 11), "video": (28, 44), "hours": (12, 30)},
    {"name": "khá", "weight": 0.30,
     "gpa": (6.0, 7.4), "failed": (0, 1), "credit_ratio": (0.82, 0.95),
     "attendance": (76, 88), "login": (20, 32), "submitted": (8, 14),
     "missing": (1, 2), "forum": (2, 7), "video": (23, 38), "hours": (8, 20)},
    {"name": "cần chú ý", "weight": 0.19,
     "gpa": (4.5, 6.0), "failed": (2, 3), "credit_ratio": (0.58, 0.80),
     "attendance": (60, 76), "login": (14, 24), "submitted": (4, 9),
     "missing": (3, 5), "forum": (0, 4), "video": (18, 30), "hours": (3, 12)},
    {"name": "nguy cơ cao", "weight": 0.09,
     "gpa": (2.1, 4.4), "failed": (4, 6), "credit_ratio": (0.25, 0.55),
     "attendance": (38, 60), "login": (11, 18), "submitted": (2, 6),
     "missing": (6, 9), "forum": (0, 2), "video": (16, 24), "hours": (0, 7)},
]

LECTURERS = [
    ("gv01", "ThS. Nguyễn Văn Giảng"),
    ("gv02", "TS. Trần Thị Mai Anh"),
    ("gv03", "ThS. Lê Hoàng Phúc"),
    ("gv04", "TS. Phạm Thanh Tùng"),
    ("gv05", "ThS. Đỗ Khánh Linh"),
]

COUNSELORS = [
    ("TS. Nguyễn Thị Hương", "Trưởng phòng Công tác sinh viên"),
    ("ThS. Trần Minh Khoa", "Cố vấn học tập trưởng"),
    ("ThS. Lê Thu Trang", "Chuyên viên tư vấn tâm lý học đường"),
    ("CN. Phạm Quang Huy", "Chuyên viên hỗ trợ tài chính sinh viên"),
    ("ThS. Võ Ngọc Bích", "Cố vấn học tập khoa Công nghệ thông tin"),
]

INTERVENTIONS = [
    ("academic_counseling", "Tư vấn học tập định kỳ hai tuần một lần",
     "Rà soát tiến độ từng môn, ưu tiên các môn đang nợ."),
    ("peer_tutoring", "Ghép nhóm học tập với sinh viên khá",
     "Kèm các môn cơ sở ngành đang bị điểm thấp."),
    ("parental_outreach", "Thông báo tình hình tới gia đình",
     "Gửi thư về tình trạng chuyên cần và kết quả học tập, đề nghị phối hợp."),
    ("financial_aid_review", "Rà soát điều kiện hỗ trợ tài chính",
     "Kiểm tra khả năng miễn giảm học phí hoặc học bổng hỗ trợ."),
    ("advising", "Điều chỉnh kế hoạch đăng ký tín chỉ",
     "Giảm tải số tín chỉ, ưu tiên học lại môn đã trượt trước khi học môn mới."),
    ("emergency_grant", "Đề xuất trợ cấp khẩn cấp",
     "Lập hồ sơ xin quỹ hỗ trợ cho sinh viên khó khăn đột xuất."),
]

MEETING_NOTES = [
    "Sinh viên đi làm thêm ca tối nên hay vắng buổi sáng. Đã thống nhất điều chỉnh "
    "lịch làm và cam kết dự đủ các buổi thực hành.",
    "Kết quả giảm rõ từ kỳ trước, khó ở các môn cơ sở ngành. Đề nghị ghép nhóm học "
    "tập và bố trí phụ đạo.",
    "Gia đình đang gặp khó khăn tài chính. Đã hướng dẫn làm hồ sơ xét miễn giảm học phí.",
    "Đã trao đổi với phụ huynh. Gia đình chưa nắm được tình hình chuyên cần, cam kết "
    "phối hợp nhắc nhở.",
    "Sinh viên có dấu hiệu quá tải và mất động lực. Đã giới thiệu tới chuyên viên tư vấn "
    "tâm lý, đề xuất giảm tín chỉ kỳ tới.",
]


def _full_name(rng: random.Random) -> str:
    if rng.random() < 0.5:
        return f"{rng.choice(SURNAMES)} {rng.choice(MIDDLE_M)} {rng.choice(GIVEN_M)}"
    return f"{rng.choice(SURNAMES)} {rng.choice(MIDDLE_F)} {rng.choice(GIVEN_F)}"


def _semesters_studied(enrollment_year: int, semester: str) -> int:
    """Số học kỳ đã học tính đến hết `semester`; <= 0 nghĩa là chưa nhập học."""
    year, term = semester.split(".")
    return int(year) * 2 + int(term) - (enrollment_year * 2 + 1) + 1


def _metrics_for(rng, profile, order: int, drift: float, studied: int) -> dict:
    """
    Bộ chỉ số của một học kỳ.

    `drift` là xu hướng riêng của từng sinh viên (âm là đang đi xuống), nhờ đó
    mỗi người có một đường biến động riêng thay vì dao động quanh một mức cố định.
    """
    shift = drift * order

    gpa = round(min(max(rng.uniform(*profile["gpa"]) + shift * 0.6, 0), 10), 2)
    failed = max(0, min(rng.randint(*profile["failed"]) - round(shift), 10))

    registered = rng.choice([15, 16, 18, 20, 21, 24])
    # Tín chỉ TÍCH LUỸ: khoảng 17 tín chỉ đạt mỗi kỳ, nhân số kỳ đã học.
    completed = max(4, min(round(studied * 17 * rng.uniform(*profile["credit_ratio"])), 140))

    attendance = round(min(max(rng.uniform(*profile["attendance"]) + shift * 4, 0), 100), 2)
    total_sessions = rng.randint(40, 60)

    return {
        "gpa": gpa,
        "failed_subjects": failed,
        "credits_completed": completed,
        "credits_registered": registered,
        "attendance_rate": attendance,
        "total_sessions": total_sessions,
        "absent_sessions": round(total_sessions * (100 - attendance) / 100),
        "login_count": max(0, rng.randint(*profile["login"]) + int(shift * 3)),
        "assignment_submitted": max(0, rng.randint(*profile["submitted"]) + round(shift)),
        "assignment_missing": max(0, rng.randint(*profile["missing"]) - round(shift)),
        "forum_posts": max(0, rng.randint(*profile["forum"]) + int(shift)),
        "video_views": max(0, rng.randint(*profile["video"]) + int(shift * 4)),
        "learning_hours": round(max(0.0, rng.uniform(*profile["hours"]) + shift * 2), 2),
    }


def _wipe() -> None:
    """Xoá dữ liệu nghiệp vụ, giữ lại tài khoản admin để còn đường đăng nhập."""
    for model in (Intervention, MeetingLog, Prediction, LearningInteraction,
                  Attendance, AcademicResult, Counselor):
        db.session.query(model).delete()
    db.session.query(User).filter(User.role != "admin").delete(synchronize_session=False)
    db.session.query(Student).delete()
    db.session.commit()
    print("Đã xoá dữ liệu mẫu cũ (giữ lại tài khoản admin).")


def _seed_accounts() -> list[User]:
    if db.session.query(User).filter_by(username="admin").first() is None:
        admin = User(username="admin", full_name="Quản trị viên",
                     role="admin", email="admin@eduguard.local")
        admin.set_password("admin123")
        db.session.add(admin)

    lecturers = []
    for username, full_name in LECTURERS:
        user = db.session.query(User).filter_by(username=username).first()
        if user is None:
            user = User(username=username, full_name=full_name, role="lecturer",
                        email=f"{username}@eduguard.local")
            user.set_password("giangvien123")
            db.session.add(user)
        lecturers.append(user)

    db.session.commit()
    return lecturers


def _seed_counselors() -> list[Counselor]:
    counselors = []
    for index, (full_name, title) in enumerate(COUNSELORS, start=1):
        email = f"counselor{index}@eduguard.local"
        counselor = db.session.query(Counselor).filter_by(email=email).first()
        if counselor is None:
            counselor = Counselor(full_name=full_name, title=title, email=email,
                                  phone=f"09012345{index:02d}")
            db.session.add(counselor)
        counselors.append(counselor)

    db.session.commit()
    return counselors


def run(n_students: int = DEFAULT_STUDENTS, reset: bool = False) -> None:
    rng = random.Random(SEED)
    app = create_app()

    with app.app_context():
        if reset:
            _wipe()
        elif db.session.query(Student).count():
            print("CSDL đã có sinh viên. Dùng --reset nếu muốn sinh lại từ đầu.")
            return

        # Model được nạp một lần rồi giữ trong bộ nhớ; xoá cache phòng trường
        # hợp script chạy sau một lần huấn luyện lại trong cùng tiến trình.
        predictor.reset_cache()

        print(f"Sinh dữ liệu cho {n_students} sinh viên (seed={SEED})…")
        lecturers = _seed_accounts()
        counselors = _seed_counselors()

        # ----- Sinh viên -----
        students = []
        for i in range(1, n_students + 1):
            code, major = rng.choice(MAJORS)
            year = rng.choice(ENROLLMENT_YEARS)

            student = Student(
                student_code=f"SV{year}{i:04d}",
                full_name=_full_name(rng),
                email=f"sv{year}{i:04d}@eduguard.local",
                phone=f"09{rng.randint(10_000_000, 99_999_999)}",
                class_name=f"{code}-K{year % 100}-{rng.randint(1, 3):02d}",
                major=major,
                enrollment_year=year,
                status="active",
            )
            student.profile_ = rng.choices(PROFILES, [p["weight"] for p in PROFILES])[0]
            student.drift_ = rng.uniform(-0.55, 0.45)
            students.append(student)
            db.session.add(student)

        db.session.flush()
        for index, student in enumerate(students):
            student.advisor_user_id = lecturers[index % len(lecturers)].user_id
        db.session.commit()
        print(f"  {len(students)} sinh viên, chia đều cho {len(lecturers)} giảng viên")

        # ----- Chỉ số và dự đoán theo từng học kỳ -----
        risk_counts: dict[str, int] = {}
        newest_prediction: dict[int, tuple[Student, Prediction, str]] = {}
        rows = 0

        for index, student in enumerate(students, start=1):
            active = [(order, name, start, end)
                      for order, (name, start, end) in enumerate(SEMESTERS)
                      if _semesters_studied(student.enrollment_year, name) >= 1]
            last_order = active[-1][0]

            for order, name, start, end in active:
                studied = _semesters_studied(student.enrollment_year, name)
                values = _metrics_for(rng, student.profile_, order, student.drift_, studied)

                # created_at gán tường minh, tăng dần theo học kỳ. Để mặc định
                # thì cả ba kỳ trùng thời điểm và "bản ghi gần nhất" không xác định.
                stamp = datetime.combine(end, datetime.min.time()) + timedelta(hours=9)

                db.session.add(AcademicResult(
                    student_id=student.student_id, semester=name,
                    gpa=values["gpa"], failed_subjects=values["failed_subjects"],
                    credits_completed=values["credits_completed"],
                    credits_registered=values["credits_registered"],
                    created_at=stamp))
                db.session.add(Attendance(
                    student_id=student.student_id, period_start=start, period_end=end,
                    attendance_rate=values["attendance_rate"],
                    total_sessions=values["total_sessions"],
                    absent_sessions=values["absent_sessions"], created_at=stamp))
                db.session.add(LearningInteraction(
                    student_id=student.student_id, period_start=start, period_end=end,
                    login_count=values["login_count"],
                    assignment_submitted=values["assignment_submitted"],
                    assignment_missing=values["assignment_missing"],
                    forum_posts=values["forum_posts"], video_views=values["video_views"],
                    learning_hours=values["learning_hours"], created_at=stamp))

                # Dự đoán bằng chính model đã huấn luyện, kèm SHAP thật.
                features = {k: values[k] for k in
                            ("gpa", "failed_subjects", "credits_completed", "attendance_rate",
                             "login_count", "assignment_submitted", "assignment_missing",
                             "forum_posts", "video_views", "learning_hours")}
                result = predictor.predict(features)

                prediction = Prediction(
                    student_id=student.student_id,
                    probability=result["probability"],
                    risk_level=result["risk_level"],
                    is_at_risk=result["is_at_risk"],
                    model_version=result["model_version"],
                    shap_top_factors=predictor.explain(features),
                    created_at=stamp + timedelta(hours=2))
                db.session.add(prediction)
                rows += 4

                if order == last_order:
                    risk_counts[result["risk_level"]] = risk_counts.get(result["risk_level"], 0) + 1
                    newest_prediction[student.student_id] = (student, prediction, result["risk_level"])

                    # Một phần nhóm tệ nhất được đánh dấu đã nghỉ học, để hệ
                    # thống có cả số liệu thật chứ không chỉ có dự đoán.
                    if result["probability"] >= 0.9 and rng.random() < 0.35:
                        student.status = "dropped"

            if index % 100 == 0:
                db.session.commit()
                print(f"  … {index}/{len(students)}")

        db.session.commit()
        print(f"  {rows} bản ghi chỉ số và dự đoán")

        # ----- Gặp mặt và can thiệp cho nhóm nguy cơ cao -----
        db.session.flush()
        meetings = actions = 0

        for student, prediction, risk_level in newest_prediction.values():
            if risk_level not in ("Cao", "Rất cao"):
                continue

            counselor = rng.choice(counselors)
            for k in range(2 if risk_level == "Rất cao" else 1):
                meeting_date = date(2026, 3, 1) + timedelta(days=rng.randint(0, 120) + k * 21)

                meeting = MeetingLog(
                    student_id=student.student_id, counselor_id=counselor.counselor_id,
                    meeting_date=meeting_date,
                    meeting_type=rng.choice(["academic_counseling", "personal_check_in",
                                             "parental_outreach", "financial_aid_review"]),
                    duration_minutes=rng.choice([30, 45, 60]),
                    notes=rng.choice(MEETING_NOTES))
                db.session.add(meeting)
                db.session.flush()
                meetings += 1

                category, title, description = rng.choice(INTERVENTIONS)
                status = rng.choices(["not_started", "in_progress", "completed"],
                                     [0.3, 0.45, 0.25])[0]
                due = meeting_date + timedelta(days=rng.randint(14, 60))

                db.session.add(Intervention(
                    student_id=student.student_id,
                    prediction_id=prediction.prediction_id,
                    meeting_id=meeting.meeting_id,
                    counselor_id=counselor.counselor_id,
                    category=category, title=title, description=description,
                    status=status, due_date=due,
                    completed_at=datetime.combine(due, datetime.min.time())
                    if status == "completed" else None))
                actions += 1

        db.session.commit()
        print(f"  {meetings} biên bản gặp mặt, {actions} việc can thiệp")

        # ----- Tài khoản sinh viên mẫu -----
        if db.session.query(User).filter_by(username="sv01").first() is None:
            first = db.session.query(Student).order_by(Student.student_id).first()
            account = User(username="sv01", full_name=first.full_name,
                           role="student", student_id=first.student_id)
            account.set_password("sinhvien123")
            db.session.add(account)
            db.session.commit()
            print(f"  Tài khoản sv01 gắn với {first.student_code}")

        _print_summary(risk_counts, n_students)


def _print_summary(risk_counts: dict, n_students: int) -> None:
    total = sum(risk_counts.values()) or 1

    print("\n=== Đã xong ===")
    print(f"Sinh viên           : {db.session.query(Student).count()}"
          f" (đã nghỉ: {db.session.query(Student).filter_by(status='dropped').count()})")
    print(f"Kết quả học tập     : {db.session.query(AcademicResult).count()}")
    print(f"Chuyên cần          : {db.session.query(Attendance).count()}")
    print(f"Tương tác học tập   : {db.session.query(LearningInteraction).count()}")
    print(f"Dự đoán             : {db.session.query(Prediction).count()}")
    print(f"Gặp mặt / can thiệp : {db.session.query(MeetingLog).count()}"
          f" / {db.session.query(Intervention).count()}")

    print("\nPhân bố nguy cơ (theo học kỳ mới nhất của mỗi sinh viên):")
    for level in ("Thấp", "Trung bình", "Cao", "Rất cao"):
        count = risk_counts.get(level, 0)
        print(f"  {level:<12}: {count:>4}  ({count * 100 / total:.1f}%)")

    print("\nTài khoản đăng nhập:")
    print("  admin / admin123            quản trị viên")
    print(f"  gv01…gv05 / giangvien123    giảng viên (mỗi người ~{n_students // len(LECTURERS)} sinh viên)")
    print("  sv01 / sinhvien123          sinh viên")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sinh dữ liệu mẫu cho EduGuard AI")
    parser.add_argument("--students", type=int, default=DEFAULT_STUDENTS,
                        help=f"số sinh viên cần tạo (mặc định {DEFAULT_STUDENTS})")
    parser.add_argument("--reset", action="store_true",
                        help="xoá dữ liệu mẫu cũ trước khi sinh lại")
    args = parser.parse_args()

    run(n_students=args.students, reset=args.reset)
