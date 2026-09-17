"""Thống kê, cảnh báo sớm, dự đoán hàng loạt, mô phỏng, báo cáo, nhập file."""
from urllib.parse import quote

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import text

from controllers import DB, Admin, Staff
from models import analytics, ml, services
from models.schemas import Features, SimulateIn

router = APIRouter(prefix="/api", tags=["Thống kê và công cụ"])


@router.get("/health", tags=["Hệ thống"])
def health(db: DB):
    """Truy vấn CSDL thật: tiến trình còn sống mà mất kết nối CSDL thì ứng dụng đã hỏng."""
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Không kết nối được CSDL")
    return {"status": "ok", "model_trained": ml.is_trained()}


@router.get("/dashboard")
def dashboard(user: Staff, db: DB):
    return {
        "summary": analytics.summary(db, user.scope),
        "by_class": analytics.by_class(db, user.scope),
        "scatter": analytics.scatter(db, user.scope),
        "alerts": analytics.alert_count(db, user.scope),
        "model": ml.model_info() if ml.is_trained() else None,
    }


@router.get("/alerts")
def alerts(user: Staff, db: DB):
    return analytics.alerts(db, user.scope)


@router.post("/predictions/batch")
def predict_batch(user: Staff, db: DB):
    """Dự đoán lại cho mọi sinh viên trong phạm vi có chỉ số mới hơn lần dự đoán gần nhất."""
    try:
        return services.predict_outdated(db, user.scope)
    except FileNotFoundError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))


@router.post("/predictions/try")
def try_prediction(body: Features, _user: Staff):
    """Thử nhanh với chỉ số nhập tay — không gắn sinh viên, không lưu."""
    features = body.model_dump()
    try:
        return {**ml.predict(features), "factors": ml.explain(features),
                "suggestions": services.suggest_interventions(ml.explain(features))}
    except FileNotFoundError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))


@router.post("/simulate")
def simulate(body: SimulateIn, _user: Staff):
    return services.simulate(body.base.model_dump(), body.changes)


@router.get("/model")
def model(_user: Staff):
    if not ml.is_trained():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Chưa huấn luyện model")
    return {**ml.model_info(), "ranges": ml.training_ranges(), "features": ml.FEATURES}


@router.get("/reports/options")
def report_options(user: Staff, db: DB):
    return {"classes": services.classes(db, user.scope), "semesters": analytics.semesters(db, user.scope)}


@router.get("/reports/export")
def export_report(user: Staff, db: DB, class_name: str = "", semester: str = ""):
    workbook = analytics.report_workbook(db, user.scope, class_name or None, semester or None)
    name = "_".join(["bao_cao", *(p.replace(" ", "_") for p in (class_name, semester) if p)]) + ".xlsx"
    return StreamingResponse(
        workbook, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}"})


@router.post("/imports/students")
async def import_students(_admin: Admin, db: DB, file: UploadFile = File(...)):
    frame = analytics.read_upload(file.filename or "", await file.read())
    return analytics.import_students(db, frame)


@router.post("/imports/metrics")
async def import_metrics(user: Staff, db: DB, file: UploadFile = File(...)):
    frame = analytics.read_upload(file.filename or "", await file.read())
    return analytics.import_metrics(db, frame, user)


@router.get("/imports/template/{kind}")
def import_template(kind: str, _user: Staff):
    content, filename = analytics.template_csv(kind)
    return Response(content, media_type="text/csv",
                    headers={"Content-Disposition": f"attachment; filename={filename}"})
