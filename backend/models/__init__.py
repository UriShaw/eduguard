"""
Tầng Model — phần dữ liệu.

    database.py  kết nối CSDL
    entities.py  tám bảng ORM và luật phân quyền gốc
    schemas.py   ràng buộc dữ liệu vào/ra của API
"""
from models.database import Base, SessionLocal, engine
from models.entities import (
                             INTERVENTION_CATEGORIES,
                             INTERVENTION_STATUSES,
                             MEETING_TYPES,
                             AcademicResult,
                             Attendance,
                             Counselor,
                             Intervention,
                             LearningInteraction,
                             MeetingLog,
                             Prediction,
                             Student,
                             User,
)

__all__ = [
    "AcademicResult", "Attendance", "Base", "Counselor", "INTERVENTION_CATEGORIES", "INTERVENTION_STATUSES",
    "Intervention", "LearningInteraction", "MEETING_TYPES", "MeetingLog", "Prediction", "SessionLocal",
    "Student", "User", "engine",
]
