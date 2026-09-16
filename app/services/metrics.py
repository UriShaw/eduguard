"""
Ghi chỉ số học tập của sinh viên.

Một lần ghi tạo đồng thời ba dòng: kết quả học tập, chuyên cần và tương tác.
Ba bảng luôn được ghi cùng nhau vì chúng là ba mặt của cùng một lát cắt dữ
liệu tại một thời điểm; tách rời sẽ sinh ra trạng thái nửa vời, trong đó sinh
viên có GPA của kỳ này nhưng chuyên cần của kỳ trước.

Không ghi đè dòng cũ. Lịch sử chỉ số chính là thứ cho phép nhìn xu hướng đi
lên hay đi xuống của một sinh viên.
"""
from datetime import date

from app.extensions import db
from app.ml.features import RAW_FEATURES
from app.models import AcademicResult, Attendance, LearningInteraction, Student


class MetricsError(Exception):
    pass


def record_snapshot(student: Student, data: dict, period: date | None = None) -> dict:
    """
    Ghi một lát cắt chỉ số mới.

    `period` mặc định là hôm nay; truyền vào khi nhập bù dữ liệu của kỳ trước.
    """
    period = period or date.today()

    academic = AcademicResult(
        student_id=student.student_id,
        semester=data["semester"],
        gpa=data["gpa"],
        failed_subjects=data["failed_subjects"],
        credits_completed=data["credits_completed"],
        credits_registered=data["credits_registered"],
    )
    attendance = Attendance(
        student_id=student.student_id,
        period_start=period,
        period_end=period,
        attendance_rate=data["attendance_rate"],
        total_sessions=data["total_sessions"],
        absent_sessions=data["absent_sessions"],
    )
    interaction = LearningInteraction(
        student_id=student.student_id,
        period_start=period,
        period_end=period,
        login_count=data["login_count"],
        assignment_submitted=data["assignment_submitted"],
        assignment_missing=data["assignment_missing"],
        forum_posts=data["forum_posts"],
        video_views=data["video_views"],
        learning_hours=data["learning_hours"],
    )

    db.session.add_all([academic, attendance, interaction])
    db.session.commit()

    return {"academic": academic, "attendance": attendance, "interaction": interaction}


def latest_features(student: Student) -> dict:
    """
    Bộ chỉ số gần nhất của sinh viên, đúng khoá mà model cần.

    Dùng để điền sẵn biểu mẫu dự đoán. Chỉ số nào chưa có dữ liệu nguồn thì
    để None — điền đại một con số thay cho dữ liệu thiếu sẽ tạo ra dự đoán
    trông như thật nhưng dựa trên số bịa.
    """
    academic = student.latest_academic()
    attendance = student.latest_attendance()
    interaction = student.latest_interaction()

    values = {
        "gpa": float(academic.gpa) if academic else None,
        "failed_subjects": academic.failed_subjects if academic else None,
        "credits_completed": academic.credits_completed if academic else None,
        "attendance_rate": float(attendance.attendance_rate) if attendance else None,
        "login_count": interaction.login_count if interaction else None,
        "assignment_submitted": interaction.assignment_submitted if interaction else None,
        "assignment_missing": interaction.assignment_missing if interaction else None,
        "forum_posts": interaction.forum_posts if interaction else None,
        "video_views": interaction.video_views if interaction else None,
        "learning_hours": float(interaction.learning_hours) if interaction else None,
    }

    return {
        "values": {k: values[k] for k in RAW_FEATURES},
        "has_data": any(v is not None for v in values.values()),
        "is_complete": all(values[k] is not None for k in RAW_FEATURES),
    }


def history(student: Student) -> dict:
    """Toàn bộ lịch sử chỉ số, mới nhất trước — dùng ở trang hồ sơ sinh viên."""
    return {
        "academic": student.academic_results.order_by(AcademicResult.created_at.desc()).all(),
        "attendance": student.attendances.order_by(Attendance.created_at.desc()).all(),
        "interaction": student.interactions.order_by(LearningInteraction.created_at.desc()).all(),
    }
