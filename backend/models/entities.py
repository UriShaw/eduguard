"""
Tám thực thể dữ liệu, khớp đúng database/schema.sql.

Chỉ khai báo cấu trúc bảng và những luật gắn liền với dữ liệu: phân quyền trên
từng sinh viên, nhãn hiển thị. Truy vấn và nghiệp vụ nằm ở services/.
"""
from datetime import date, datetime

from pwdlib import PasswordHash
from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.database import Base

passwords = PasswordHash.recommended()


def _now() -> datetime:
    return datetime.utcnow()


# ===========================================================================
# Tài khoản và luật phân quyền
# ===========================================================================

class User(Base):
    __tablename__ = "users"

    ROLE_LABELS = {"admin": "Quản trị viên", "lecturer": "Giảng viên", "student": "Sinh viên"}

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(150))
    email: Mapped[str | None] = mapped_column(String(150), unique=True)
    role: Mapped[str] = mapped_column(Enum(*ROLE_LABELS, name="user_role"), index=True)
    # Chỉ có giá trị khi role='student': hồ sơ mà tài khoản này sở hữu.
    student_id: Mapped[int | None] = mapped_column(ForeignKey("students.student_id", ondelete="CASCADE"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    def set_password(self, raw: str) -> None:
        self.password_hash = passwords.hash(raw)

    def check_password(self, raw: str) -> bool:
        return passwords.verify(raw, self.password_hash)

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def is_student(self) -> bool:
        return self.role == "student"

    @property
    def scope(self) -> int | None:
        """
        Phạm vi dữ liệu: None với quản trị viên (toàn hệ thống), user_id với
        giảng viên (chỉ sinh viên mình phụ trách). Mọi truy vấn danh sách và
        thống kê nhận giá trị này, nhờ vậy phân quyền được áp nhất quán.
        """
        return None if self.is_admin else self.user_id

    def can_view(self, student: "Student | None") -> bool:
        """
        LUẬT PHÂN QUYỀN GỐC. Mọi controller quy về đây thay vì tự kiểm tra
        vai trò — sửa luật chỉ phải sửa một chỗ.
        """
        if student is None:
            return False
        if self.is_admin:
            return True
        if self.role == "lecturer":
            return student.advisor_user_id == self.user_id
        return student.student_id == self.student_id

    def can_edit(self, student: "Student | None") -> bool:
        """Sinh viên chỉ được xem, kể cả với hồ sơ của chính mình."""
        return not self.is_student and self.can_view(student)


# ===========================================================================
# Sinh viên
# ===========================================================================

class Student(Base):
    __tablename__ = "students"

    student_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_code: Mapped[str] = mapped_column(String(20), unique=True)
    full_name: Mapped[str] = mapped_column(String(150))
    email: Mapped[str | None] = mapped_column(String(150), unique=True)
    phone: Mapped[str | None] = mapped_column(String(20))
    class_name: Mapped[str | None] = mapped_column(String(50), index=True)
    major: Mapped[str | None] = mapped_column(String(100))
    enrollment_year: Mapped[int | None] = mapped_column(SmallInteger)
    status: Mapped[str] = mapped_column(Enum("active", "dropped", "graduated", name="student_status"),
                                        default="active", index=True)
    # users và students trỏ vòng vào nhau; use_alter tạo khoá này bằng ALTER
    # sau khi cả hai bảng đã có — khớp với schema.sql.
    advisor_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.user_id", ondelete="SET NULL", use_alter=True, name="fk_students_advisor"),
        index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    advisor: Mapped["User | None"] = relationship(foreign_keys=[advisor_user_id])
    academic_results: Mapped[list["AcademicResult"]] = relationship(
        back_populates="student", cascade="all, delete-orphan", order_by="AcademicResult.created_at")
    attendances: Mapped[list["Attendance"]] = relationship(
        back_populates="student", cascade="all, delete-orphan", order_by="Attendance.created_at")
    interactions: Mapped[list["LearningInteraction"]] = relationship(
        back_populates="student", cascade="all, delete-orphan", order_by="LearningInteraction.created_at")
    predictions: Mapped[list["Prediction"]] = relationship(
        back_populates="student", cascade="all, delete-orphan", order_by="Prediction.created_at")
    meetings: Mapped[list["MeetingLog"]] = relationship(
        back_populates="student", cascade="all, delete-orphan", order_by="MeetingLog.meeting_date.desc()")
    interventions: Mapped[list["Intervention"]] = relationship(
        back_populates="student", cascade="all, delete-orphan")


# ===========================================================================
# Chỉ số đầu vào của model — ba bảng luôn được ghi cùng lúc thành một lát cắt
# ===========================================================================

class AcademicResult(Base):
    __tablename__ = "academic_results"

    result_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.student_id", ondelete="CASCADE"), index=True)
    semester: Mapped[str] = mapped_column(String(20))
    gpa: Mapped[float] = mapped_column(Numeric(3, 2, asdecimal=False))
    failed_subjects: Mapped[int] = mapped_column(SmallInteger, default=0)
    # Tín chỉ TÍCH LUỸ đến hết học kỳ, không phải của riêng kỳ — đúng nghĩa
    # model được huấn luyện. Nhập sai nghĩa sẽ làm dự đoán lệch hoàn toàn.
    credits_completed: Mapped[int] = mapped_column(SmallInteger, default=0)
    credits_registered: Mapped[int] = mapped_column(SmallInteger, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    student: Mapped[Student] = relationship(back_populates="academic_results")


class Attendance(Base):
    __tablename__ = "attendance"

    attendance_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.student_id", ondelete="CASCADE"), index=True)
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    attendance_rate: Mapped[float] = mapped_column(Numeric(5, 2, asdecimal=False))
    total_sessions: Mapped[int] = mapped_column(SmallInteger, default=0)
    absent_sessions: Mapped[int] = mapped_column(SmallInteger, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    student: Mapped[Student] = relationship(back_populates="attendances")


class LearningInteraction(Base):
    __tablename__ = "learning_interactions"

    interaction_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.student_id", ondelete="CASCADE"), index=True)
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    login_count: Mapped[int] = mapped_column(Integer, default=0)
    assignment_submitted: Mapped[int] = mapped_column(Integer, default=0)
    assignment_missing: Mapped[int] = mapped_column(Integer, default=0)
    forum_posts: Mapped[int] = mapped_column(Integer, default=0)
    video_views: Mapped[int] = mapped_column(Integer, default=0)
    learning_hours: Mapped[float] = mapped_column(Numeric(6, 2, asdecimal=False), default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    student: Mapped[Student] = relationship(back_populates="interactions")


# ===========================================================================
# Kết quả dự đoán — mỗi lần chạy một dòng mới, không ghi đè
# ===========================================================================

class Prediction(Base):
    __tablename__ = "predictions"

    prediction_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.student_id", ondelete="CASCADE"), index=True)
    probability: Mapped[float] = mapped_column(Numeric(5, 4, asdecimal=False))
    risk_level: Mapped[str] = mapped_column(
        Enum("Thấp", "Trung bình", "Cao", "Rất cao", name="risk_level"), index=True)
    is_at_risk: Mapped[bool] = mapped_column(Boolean)
    model_version: Mapped[str] = mapped_column(String(50))
    # Giải thích SHAP lưu ngay lúc dự đoán: model có thể được huấn luyện lại,
    # mà một kết quả cũ phải giải thích được bằng đúng model đã sinh ra nó.
    shap_top_factors: Mapped[list | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, index=True)

    student: Mapped[Student] = relationship(back_populates="predictions")


# ===========================================================================
# Hỗ trợ sinh viên
# ===========================================================================

class Counselor(Base):
    __tablename__ = "counselors"

    counselor_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(150))
    title: Mapped[str | None] = mapped_column(String(150))
    email: Mapped[str | None] = mapped_column(String(150), unique=True)
    phone: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


MEETING_TYPES = {
    "academic_counseling": "Tư vấn học tập",
    "financial_aid_review": "Xét hỗ trợ tài chính",
    "disciplinary_review": "Xem xét kỷ luật",
    "parental_outreach": "Liên hệ gia đình",
    "personal_check_in": "Gặp mặt cá nhân",
}

INTERVENTION_CATEGORIES = {
    "academic_counseling": "Tư vấn học tập",
    "financial_aid_review": "Xét hỗ trợ tài chính",
    "peer_tutoring": "Kèm cặp theo nhóm",
    "parental_outreach": "Liên hệ gia đình",
    "emergency_grant": "Trợ cấp khẩn cấp",
    "fafsa_check": "Rà soát hồ sơ trợ cấp",
    "advising": "Cố vấn 1-1",
    "other": "Khác",
}

INTERVENTION_STATUSES = {"not_started": "Chưa bắt đầu", "in_progress": "Đang xử lý", "completed": "Đã xong"}


class MeetingLog(Base):
    __tablename__ = "meeting_logs"

    meeting_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.student_id", ondelete="CASCADE"), index=True)
    counselor_id: Mapped[int | None] = mapped_column(ForeignKey("counselors.counselor_id", ondelete="SET NULL"))
    meeting_date: Mapped[date] = mapped_column(Date)
    meeting_type: Mapped[str] = mapped_column(Enum(*MEETING_TYPES, name="meeting_type"))
    duration_minutes: Mapped[int] = mapped_column(SmallInteger, default=30)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    student: Mapped[Student] = relationship(back_populates="meetings")
    counselor: Mapped[Counselor | None] = relationship()


class Intervention(Base):
    """
    Việc can thiệp cần theo dõi tiến độ. Thư gửi gia đình là
    category='parental_outreach' ngay trong bảng này — bản chất vẫn là một việc
    có hạn và có trạng thái, tách bảng chỉ nhân đôi cấu trúc.
    """
    __tablename__ = "interventions"

    intervention_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.student_id", ondelete="CASCADE"), index=True)
    prediction_id: Mapped[int | None] = mapped_column(ForeignKey("predictions.prediction_id", ondelete="SET NULL"))
    meeting_id: Mapped[int | None] = mapped_column(ForeignKey("meeting_logs.meeting_id", ondelete="SET NULL"))
    counselor_id: Mapped[int | None] = mapped_column(ForeignKey("counselors.counselor_id", ondelete="SET NULL"))
    category: Mapped[str] = mapped_column(Enum(*INTERVENTION_CATEGORIES, name="intervention_category"),
                                          default="other")
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Enum(*INTERVENTION_STATUSES, name="intervention_status"),
                                        default="not_started", index=True)
    due_date: Mapped[date | None] = mapped_column(Date)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    student: Mapped[Student] = relationship(back_populates="interventions")
    counselor: Mapped[Counselor | None] = relationship()

    @property
    def is_overdue(self) -> bool:
        return self.status != "completed" and self.due_date is not None and self.due_date < date.today()
