"""
Lược đồ dữ liệu vào/ra của API (Pydantic).

Mọi ràng buộc kiểm tra dữ liệu gửi lên khai báo tại đây — FastAPI tự trả 422
kèm TOÀN BỘ lỗi trong một lần, client không phải sửa từng lỗi qua nhiều lượt.
Giới hạn trùng với ràng buộc CHECK trong schema.sql.
"""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

RiskLevel = Literal["Thấp", "Trung bình", "Cao", "Rất cao"]
Role = Literal["admin", "lecturer", "student"]
StudentStatus = Literal["active", "dropped", "graduated"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ----- Tài khoản -----

class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1)


class UserOut(ORM):
    user_id: int
    username: str
    full_name: str
    role: Role
    student_id: int | None


# ----- Chỉ số -----

class Features(BaseModel):
    """Mười chỉ số đầu vào của model, khớp đúng models.ml.RAW_FEATURES."""
    gpa: float = Field(ge=0, le=10)
    failed_subjects: int = Field(ge=0)
    credits_completed: int = Field(ge=0, description="Tín chỉ TÍCH LUỸ từ đầu khoá")
    attendance_rate: float = Field(ge=0, le=100)
    login_count: int = Field(ge=0)
    assignment_submitted: int = Field(ge=0)
    assignment_missing: int = Field(ge=0)
    forum_posts: int = Field(ge=0)
    video_views: int = Field(ge=0)
    learning_hours: float = Field(ge=0)


class MetricsIn(Features):
    """Một lát cắt chỉ số: mười chỉ số của model cộng các trường chỉ để lưu trữ."""
    semester: str = Field(min_length=1, max_length=20)
    credits_registered: int = Field(ge=0)
    total_sessions: int = Field(ge=0)
    absent_sessions: int = Field(ge=0)

    @model_validator(mode="after")
    def _absent_within_total(self):
        if self.absent_sessions > self.total_sessions:
            raise ValueError("Số buổi vắng không thể lớn hơn tổng số buổi")
        return self


class SimulateIn(BaseModel):
    """Kịch bản mô phỏng: chỉ số gốc cùng các chỉ số muốn thay đổi."""
    base: Features
    changes: dict[str, float]


# ----- Sinh viên -----

class StudentIn(BaseModel):
    student_code: str = Field(min_length=1, max_length=20)
    full_name: str = Field(min_length=1, max_length=150)
    email: EmailStr | Literal[""] | None = None
    phone: str | None = Field(default=None, max_length=20)
    class_name: str | None = Field(default=None, max_length=50)
    major: str | None = Field(default=None, max_length=100)
    enrollment_year: int | None = Field(default=None, ge=2000, le=2100)
    status: StudentStatus = "active"
    advisor_user_id: int | None = None


class StudentOut(ORM):
    student_id: int
    student_code: str
    full_name: str
    email: str | None
    phone: str | None
    class_name: str | None
    major: str | None
    enrollment_year: int | None
    status: StudentStatus
    advisor_user_id: int | None


class PredictionOut(ORM):
    prediction_id: int
    probability: float
    risk_level: RiskLevel
    is_at_risk: bool
    model_version: str
    shap_top_factors: list | None
    created_at: datetime


class StudentRow(StudentOut):
    """Một dòng trong danh sách: hồ sơ kèm chỉ số và mức nguy cơ gần nhất."""
    gpa: float | None = None
    attendance_rate: float | None = None
    risk_level: RiskLevel | None = None
    probability: float | None = None


# ----- Hỗ trợ sinh viên -----

class MeetingIn(BaseModel):
    meeting_date: date
    meeting_type: Literal["academic_counseling", "financial_aid_review", "disciplinary_review",
                          "parental_outreach", "personal_check_in"]
    duration_minutes: int = Field(default=30, ge=1, le=480)
    counselor_id: int | None = None
    notes: str | None = Field(default=None, max_length=4000)


class MeetingOut(ORM):
    meeting_id: int
    meeting_date: date
    meeting_type: str
    duration_minutes: int
    notes: str | None
    counselor_id: int | None


class InterventionIn(BaseModel):
    category: Literal["academic_counseling", "financial_aid_review", "peer_tutoring", "parental_outreach",
                      "emergency_grant", "fafsa_check", "advising", "other"] = "other"
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    due_date: date | None = None
    counselor_id: int | None = None


class InterventionOut(ORM):
    intervention_id: int
    category: str
    title: str
    description: str | None
    status: Literal["not_started", "in_progress", "completed"]
    due_date: date | None
    completed_at: datetime | None
    counselor_id: int | None
    is_overdue: bool


class StatusIn(BaseModel):
    status: Literal["not_started", "in_progress", "completed"]
