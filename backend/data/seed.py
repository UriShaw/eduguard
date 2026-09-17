"""
Sinh dữ liệu mẫu có cấu trúc cho toàn hệ thống.

Mỗi sinh viên được gán một hồ sơ học tập tiềm ẩn; mọi chỉ số sinh quanh hồ sơ
đó và biến động dần qua từng kỳ, nên dashboard cho ra bức tranh hợp lý thay vì
nhiễu trắng.

QUAN TRỌNG — khoảng giá trị trong PROFILES bám sát phân phối tập huấn luyện.
Model có StandardScaler fit trên tập đó; sinh dữ liệu ngoài vùng đã học tạo
z-score cực lớn và đẩy xác suất về 0 hoặc 1. Đổi tập huấn luyện thì phải xem
lại các khoảng này.
"""
import random
from datetime import date, datetime, timedelta

from sqlalchemy import delete, func, select

from models import (
    AcademicResult,
    Attendance,
    Counselor,
    Intervention,
    LearningInteraction,
    MeetingLog,
    Prediction,
    SessionLocal,
    Student,
    User,
)
from services import ml
from services.predictions import suggest_interventions

SEED = 42
SEMESTERS = [("2024.2", date(2025, 1, 6), date(2025, 5, 30)),
             ("2025.1", date(2025, 8, 18), date(2025, 12, 26)),
             ("2025.2", date(2026, 1, 5), date(2026, 5, 29))]

SURNAMES = "Nguyễn Trần Lê Phạm Hoàng Huỳnh Phan Vũ Võ Đặng Bùi Đỗ Hồ Ngô Dương Lý Đinh".split()
MIDDLE = {"m": "Văn Hữu Đức Minh Quang Thanh Công Xuân Tuấn".split(),
          "f": "Thị Ngọc Thanh Thu Minh Phương Kim Khánh Mai".split()}
GIVEN = {"m": "An Bình Cường Dũng Đạt Hải Hùng Khoa Long Nam Phúc Quân Sơn Thắng Trung Tú Vinh Hiếu".split(),
         "f": "Anh Chi Dung Giang Hà Hạnh Hoa Huyền Lan Linh Mai Ngân Nhung Quỳnh Thảo Trang Vy Yến".split()}
MAJORS = [("CNTT", "Công nghệ thông tin"), ("KTPM", "Kỹ thuật phần mềm"), ("QTKD", "Quản trị kinh doanh"),
          ("KETO", "Kế toán"), ("NNA", "Ngôn ngữ Anh"), ("DTVT", "Điện tử viễn thông")]

# Khoảng bám sát tập huấn luyện: gpa 2–10, failed 0–6, attendance 37–100,
# login 11–41, submitted 2–21, missing 0–9, forum 0–11, video 16–44, hours 0–185.
PROFILES = [
    (0.42, dict(gpa=(7.2, 9.5), failed=(0, 0), credit=(0.92, 1.0), att=(86, 99.5), login=(26, 41),
                sub=(10, 18), miss=(0, 1), forum=(4, 11), video=(28, 44), hours=(12, 30))),
    (0.30, dict(gpa=(6.0, 7.4), failed=(0, 1), credit=(0.82, 0.95), att=(76, 88), login=(20, 32),
                sub=(8, 14), miss=(1, 2), forum=(2, 7), video=(23, 38), hours=(8, 20))),
    (0.19, dict(gpa=(4.5, 6.0), failed=(2, 3), credit=(0.58, 0.80), att=(60, 76), login=(14, 24),
                sub=(4, 9), miss=(3, 5), forum=(0, 4), video=(18, 30), hours=(3, 12))),
    (0.09, dict(gpa=(2.1, 4.4), failed=(4, 6), credit=(0.25, 0.55), att=(38, 60), login=(11, 18),
                sub=(2, 6), miss=(6, 9), forum=(0, 2), video=(16, 24), hours=(0, 7))),
]

LECTURERS = [("gv01", "ThS. Nguyễn Văn Giảng"), ("gv02", "TS. Trần Thị Mai Anh"),
             ("gv03", "ThS. Lê Hoàng Phúc"), ("gv04", "TS. Phạm Thanh Tùng"), ("gv05", "ThS. Đỗ Khánh Linh")]
COUNSELORS = [("TS. Nguyễn Thị Hương", "Trưởng phòng Công tác sinh viên"),
              ("ThS. Trần Minh Khoa", "Cố vấn học tập trưởng"),
              ("ThS. Lê Thu Trang", "Chuyên viên tư vấn tâm lý"),
              ("CN. Phạm Quang Huy", "Chuyên viên hỗ trợ tài chính")]
NOTES = [
    "Sinh viên đi làm thêm ca tối nên hay vắng buổi sáng. Đã thống nhất điều chỉnh lịch làm.",
    "Kết quả giảm rõ từ kỳ trước, khó ở các môn cơ sở ngành. Đề nghị ghép nhóm học tập.",
    "Gia đình gặp khó khăn tài chính. Đã hướng dẫn làm hồ sơ xét miễn giảm học phí.",
    "Đã trao đổi với phụ huynh, gia đình cam kết phối hợp nhắc nhở việc đi học.",
    "Sinh viên có dấu hiệu quá tải, đã giới thiệu tới chuyên viên tư vấn tâm lý.",
]


def _account(db, username: str, full_name: str, role: str, password: str, **extra) -> User:
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        user = User(username=username, full_name=full_name, role=role, **extra)
        user.set_password(password)
        db.add(user)
    return user


def _metrics(rng: random.Random, p: dict, order: int, drift: float, semesters_studied: int) -> dict:
    """Chỉ số một học kỳ. `drift` là xu hướng riêng (âm = đang đi xuống)."""
    shift = drift * order
    u = lambda key, scale=1: rng.uniform(*p[key]) + shift * scale  # noqa: E731
    i = lambda key, scale=1: rng.randint(*p[key]) + round(shift * scale)  # noqa: E731
    attendance = round(min(max(u("att", 4), 0), 100), 2)
    total = rng.randint(40, 60)
    return {
        "gpa": round(min(max(u("gpa", 0.6), 0), 10), 2),
        "failed_subjects": max(0, min(i("failed", -1), 10)),
        # Tín chỉ TÍCH LUỸ: khoảng 17 tín chỉ đạt mỗi kỳ nhân số kỳ đã học.
        "credits_completed": max(4, min(round(semesters_studied * 17 * rng.uniform(*p["credit"])), 140)),
        "credits_registered": rng.choice([15, 16, 18, 20, 21]),
        "attendance_rate": attendance,
        "total_sessions": total,
        "absent_sessions": round(total * (100 - attendance) / 100),
        "login_count": max(0, i("login", 3)),
        "assignment_submitted": max(0, i("sub")),
        "assignment_missing": max(0, i("miss", -1)),
        "forum_posts": max(0, i("forum")),
        "video_views": max(0, i("video", 4)),
        "learning_hours": round(max(0.0, u("hours", 2)), 2),
    }


def run(n_students: int = 500, reset: bool = False) -> None:
    rng = random.Random(SEED)

    with SessionLocal() as db:
        if reset:
            for model in (Intervention, MeetingLog, Prediction, LearningInteraction, Attendance,
                          AcademicResult, Counselor):
                db.execute(delete(model))
            db.execute(delete(User).where(User.role != "admin"))
            db.execute(delete(Student))
            db.commit()
            print("Đã xoá dữ liệu mẫu cũ (giữ tài khoản admin).")
        elif db.scalar(select(func.count(Student.student_id))):
            print("CSDL đã có sinh viên. Dùng --reset để sinh lại từ đầu.")
            return

        _account(db, "admin", "Quản trị viên", "admin", "admin123", email="admin@eduguard.local")
        lecturers = [_account(db, u, n, "lecturer", "giangvien123", email=f"{u}@eduguard.local")
                     for u, n in LECTURERS]
        counselors = [Counselor(full_name=n, title=t, email=f"counselor{k}@eduguard.local")
                      for k, (n, t) in enumerate(COUNSELORS, 1)]
        db.add_all(counselors)
        db.flush()

        students = []
        for k in range(1, n_students + 1):
            code, major = rng.choice(MAJORS)
            year = rng.choice([2022, 2023, 2024, 2025])
            gender = rng.choice("mf")
            s = Student(student_code=f"SV{year}{k:04d}",
                        full_name=f"{rng.choice(SURNAMES)} {rng.choice(MIDDLE[gender])} {rng.choice(GIVEN[gender])}",
                        email=f"sv{year}{k:04d}@eduguard.local", phone=f"09{rng.randint(10**7, 10**8 - 1)}",
                        class_name=f"{code}-K{year % 100}-{rng.randint(1, 3):02d}", major=major,
                        enrollment_year=year, advisor_user_id=lecturers[(k - 1) % len(lecturers)].user_id)
            s.profile_ = rng.choices([p for _, p in PROFILES], [w for w, _ in PROFILES])[0]
            s.drift_ = rng.uniform(-0.55, 0.45)
            students.append(s)
        db.add_all(students)
        db.flush()
        print(f"  {len(students)} sinh viên, chia đều cho {len(lecturers)} giảng viên")

        newest = {}
        for k, s in enumerate(students, 1):
            for order, (semester, start, end) in enumerate(SEMESTERS):
                y, t = semester.split(".")
                studied = int(y) * 2 + int(t) - (s.enrollment_year * 2 + 1) + 1
                if studied < 1:
                    continue  # học kỳ trước khi nhập học
                v = _metrics(rng, s.profile_, order, s.drift_, studied)
                # created_at tường minh, tăng theo kỳ: để mặc định thì các kỳ trùng
                # thời điểm và "bản ghi gần nhất" trở nên không xác định.
                at = datetime.combine(end, datetime.min.time()) + timedelta(hours=9)

                db.add_all([
                    AcademicResult(student_id=s.student_id, semester=semester, gpa=v["gpa"],
                                   failed_subjects=v["failed_subjects"], credits_completed=v["credits_completed"],
                                   credits_registered=v["credits_registered"], created_at=at),
                    Attendance(student_id=s.student_id, period_start=start, period_end=end,
                               attendance_rate=v["attendance_rate"], total_sessions=v["total_sessions"],
                               absent_sessions=v["absent_sessions"], created_at=at),
                    LearningInteraction(student_id=s.student_id, period_start=start, period_end=end,
                                        login_count=v["login_count"], assignment_submitted=v["assignment_submitted"],
                                        assignment_missing=v["assignment_missing"], forum_posts=v["forum_posts"],
                                        video_views=v["video_views"], learning_hours=v["learning_hours"],
                                        created_at=at),
                ])
                result = ml.predict(v)
                prediction = Prediction(student_id=s.student_id, probability=result["probability"],
                                        risk_level=result["risk_level"], is_at_risk=result["is_at_risk"],
                                        model_version=result["model_version"], shap_top_factors=ml.explain(v),
                                        created_at=at + timedelta(hours=2))
                db.add(prediction)
                newest[s.student_id] = prediction

            last = newest.get(s.student_id)
            if last and last.probability >= 0.9 and rng.random() < 0.35:
                s.status = "dropped"
            if k % 100 == 0:
                db.flush()
                print(f"  … {k}/{len(students)}")
        db.flush()

        # Gặp mặt và can thiệp cho khoảng 70% nhóm nguy cơ cao. Cố ý để lại một
        # phần chưa có kế hoạch, để trang Cảnh báo sớm có dữ liệu thật để hiển thị.
        for s in students:
            p = newest.get(s.student_id)
            if not p or p.risk_level not in ml.AT_RISK_LEVELS or rng.random() > 0.7:
                continue
            counselor = rng.choice(counselors)
            # Mốc thời gian tính từ HÔM NAY chứ không cố định: ngày cố định sẽ trôi về quá khứ
            # và biến gần như mọi việc thành quá hạn, làm trang Cảnh báo sớm ngập nhiễu.
            day = date.today() - timedelta(days=rng.randint(3, 45))
            db.add(MeetingLog(student_id=s.student_id, counselor_id=counselor.counselor_id, meeting_date=day,
                              meeting_type=rng.choice(["academic_counseling", "personal_check_in",
                                                       "parental_outreach"]),
                              duration_minutes=rng.choice([30, 45, 60]), notes=rng.choice(NOTES)))
            for suggestion in suggest_interventions(p.shap_top_factors)[:2]:
                status = rng.choices(["not_started", "in_progress", "completed"], [0.35, 0.4, 0.25])[0]
                due = day + timedelta(days=rng.randint(14, 45))
                db.add(Intervention(student_id=s.student_id, prediction_id=p.prediction_id,
                                    counselor_id=counselor.counselor_id, category=suggestion["category"],
                                    title=suggestion["title"], description=suggestion["description"],
                                    status=status, due_date=due,
                                    completed_at=datetime.combine(due, datetime.min.time())
                                    if status == "completed" else None))

        first = min(students, key=lambda x: x.student_id)
        _account(db, "sv01", first.full_name, "student", "sinhvien123", student_id=first.student_id)
        db.commit()

        levels = {lvl: sum(1 for p in newest.values() if p.risk_level == lvl) for lvl in ml.RISK_LEVELS}
        print("\nPhân bố nguy cơ (học kỳ gần nhất):")
        for lvl, count in levels.items():
            print(f"  {lvl:<11} {count:>4}  ({count * 100 / max(len(newest), 1):.1f}%)")
        print("\nTài khoản: admin/admin123 · gv01…gv05/giangvien123 · sv01/sinhvien123")
