"""
Sinh viên và mọi thứ gắn với một sinh viên: chỉ số, dự đoán, gặp mặt, can thiệp.

Hồ sơ sinh viên là trung tâm của quy trình làm việc: một lần gọi trả về đủ để
cố vấn nhìn thấy tình hình, hiểu nguyên nhân và quyết định việc cần làm, thay
vì phải mở năm trang khác nhau như bản trước.
"""
from fastapi import APIRouter, HTTPException, Query, status

from controllers.dependencies import DB, Admin, CurrentUser, Staff, load_student
from models import (
    INTERVENTION_CATEGORIES,
    INTERVENTION_STATUSES,
    MEETING_TYPES,
    Intervention,
)
from models.schemas import (
    InterventionIn,
    InterventionOut,
    MeetingIn,
    MeetingOut,
    MetricsIn,
    PredictionOut,
    StatusIn,
    StudentIn,
    StudentOut,
    StudentRow,
)
from services import latest_for, ml, predictions, students

router = APIRouter(prefix="/api", tags=["Sinh viên"])


@router.get("/students")
def list_students(user: Staff, db: DB,
                  keyword: str = "", status_: str = Query("", alias="status"), class_name: str = "",
                  risk: str = "", page: int = Query(1, ge=1), per_page: int = Query(12, ge=1, le=100)):
    result = students.search_students(db, user.scope, keyword, status_, class_name, risk, page, per_page)
    latest = latest_for(db, (s.student_id for s in result["items"]))

    rows = []
    for s in result["items"]:
        academic, attendance = latest["academic"].get(s.student_id), latest["attendance"].get(s.student_id)
        prediction = latest["prediction"].get(s.student_id)
        rows.append(StudentRow.model_validate(s).model_copy(update={
            "gpa": academic.gpa if academic else None,
            "attendance_rate": attendance.attendance_rate if attendance else None,
            "risk_level": prediction.risk_level if prediction else None,
            "probability": prediction.probability if prediction else None,
        }))

    return {**result, "items": rows}


@router.get("/options")
def options(user: Staff, db: DB):
    """Dữ liệu cho các ô chọn trong biểu mẫu."""
    return {
        "classes": students.classes(db, user.scope),
        "lecturers": [{"id": u.user_id, "name": u.full_name} for u in students.lecturers(db)],
        "counselors": [{"id": c.counselor_id, "name": c.full_name} for c in students.counselors(db)],
        "meeting_types": MEETING_TYPES,
        "intervention_categories": INTERVENTION_CATEGORIES,
        "intervention_statuses": INTERVENTION_STATUSES,
        "features": ml.FEATURES,
    }


@router.post("/students", response_model=StudentOut, status_code=status.HTTP_201_CREATED)
def create_student(body: StudentIn, _admin: Admin, db: DB):
    return students.save_student(db, body.model_dump())


@router.get("/students/{student_id}")
def student_detail(student_id: int, user: CurrentUser, db: DB):
    """Toàn bộ hồ sơ trong một lần gọi — nền cho trang trung tâm ở frontend."""
    student = load_student(db, user, student_id)
    features = students.latest_features(student)
    latest = student.predictions[-1] if student.predictions else None
    interventions = students.sorted_interventions(student)

    return {
        "student": StudentOut.model_validate(student),
        "advisor": student.advisor.full_name if student.advisor else None,
        "can_edit": user.can_edit(student),
        "is_admin": user.is_admin,
        "features": features,
        "features_complete": students.is_complete(features),
        "latest_metrics": _latest_metrics(student),
        "prediction": PredictionOut.model_validate(latest) if latest else None,
        "previous_probability": student.predictions[-2].probability if len(student.predictions) > 1 else None,
        # Chỉ gợi ý khi người xem có quyền hành động theo gợi ý đó.
        "suggestions": predictions.suggest_interventions(latest.shap_top_factors if latest else None, interventions)
        if user.can_edit(student) else [],
        "trend": predictions.trend(student),
        "meetings": [{**MeetingOut.model_validate(m).model_dump(),
                      "type_label": MEETING_TYPES[m.meeting_type],
                      "counselor": m.counselor.full_name if m.counselor else None} for m in student.meetings],
        "interventions": [{**InterventionOut.model_validate(i).model_dump(),
                           "category_label": INTERVENTION_CATEGORIES[i.category],
                           "counselor": i.counselor.full_name if i.counselor else None} for i in interventions],
    }


def _latest_metrics(student) -> dict | None:
    if not student.academic_results:
        return None
    academic = student.academic_results[-1]
    attendance = student.attendances[-1] if student.attendances else None
    return {"semester": academic.semester, "credits_registered": academic.credits_registered,
            "total_sessions": attendance.total_sessions if attendance else None,
            "absent_sessions": attendance.absent_sessions if attendance else None,
            "recorded_at": academic.created_at.isoformat()}


@router.put("/students/{student_id}", response_model=StudentOut)
def update_student(student_id: int, body: StudentIn, admin: Admin, db: DB):
    return students.save_student(db, body.model_dump(), load_student(db, admin, student_id, edit=True))


@router.delete("/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_student(student_id: int, admin: Admin, db: DB):
    students.delete_student(db, load_student(db, admin, student_id, edit=True))


@router.post("/students/{student_id}/metrics", status_code=status.HTTP_201_CREATED)
def record_metrics(student_id: int, body: MetricsIn, user: Staff, db: DB):
    students.record_metrics(db, load_student(db, user, student_id, edit=True), body.model_dump())
    return {"ok": True}


@router.post("/students/{student_id}/predictions", response_model=PredictionOut,
             status_code=status.HTTP_201_CREATED)
def predict_student(student_id: int, user: Staff, db: DB):
    """Chạy dự đoán bằng bộ chỉ số mới nhất của sinh viên và lưu vào lịch sử."""
    student = load_student(db, user, student_id, edit=True)
    try:
        return predictions.predict_and_save(db, student, students.latest_features(student))
    except FileNotFoundError as exc:
        # 503 chứ không phải 500: hệ thống vẫn đúng, chỉ là chưa huấn luyện model.
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))


@router.get("/students/{student_id}/predictions", response_model=list[PredictionOut])
def prediction_history(student_id: int, user: CurrentUser, db: DB):
    return list(reversed(load_student(db, user, student_id).predictions))


@router.post("/students/{student_id}/meetings", status_code=status.HTTP_201_CREATED)
def add_meeting(student_id: int, body: MeetingIn, user: Staff, db: DB):
    students.add_meeting(db, load_student(db, user, student_id, edit=True), body.model_dump())
    return {"ok": True}


@router.post("/students/{student_id}/interventions", status_code=status.HTTP_201_CREATED)
def add_intervention(student_id: int, body: InterventionIn, user: Staff, db: DB):
    students.add_intervention(db, load_student(db, user, student_id, edit=True), body.model_dump())
    return {"ok": True}


@router.patch("/interventions/{intervention_id}")
def update_intervention(intervention_id: int, body: StatusIn, user: Staff, db: DB):
    item = db.get(Intervention, intervention_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy việc can thiệp")
    load_student(db, user, item.student_id, edit=True)  # kiểm tra quyền trên sinh viên sở hữu
    students.set_intervention_status(db, item, body.status)
    return {"ok": True}
