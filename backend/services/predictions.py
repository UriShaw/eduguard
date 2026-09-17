"""
Dự đoán: cho một sinh viên, hàng loạt, mô phỏng "nếu… thì", gợi ý can thiệp,
và diễn biến theo học kỳ.
"""
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Intervention, Prediction, Student
from services import ServiceError, latest_for, ml
from services.students import features_from, is_complete

# ===========================================================================
# Dự đoán
# ===========================================================================

def predict_and_save(db: Session, student: Student, features: dict) -> Prediction:
    if not is_complete(features):
        raise ServiceError("Chưa đủ mười chỉ số để dự đoán.")

    result = ml.predict(features)
    record = Prediction(student_id=student.student_id, probability=result["probability"],
                        risk_level=result["risk_level"], is_at_risk=result["is_at_risk"],
                        model_version=result["model_version"], shap_top_factors=ml.explain(features))
    db.add(record)
    db.commit()
    return record


def predict_outdated(db: Session, scope: int | None = None) -> dict:
    """
    DỰ ĐOÁN HÀNG LOẠT cho mọi sinh viên có chỉ số MỚI HƠN lần dự đoán gần nhất.

    Mắt xích còn thiếu của quy trình: sau mỗi đợt nhập chỉ số cho cả khoa, bản
    trước phải bấm dự đoán lần lượt từng người. Sinh viên đã có dự đoán ứng với
    chỉ số hiện tại được bỏ qua để lịch sử không bị nhân bản.
    """
    query = select(Student.student_id)
    if scope is not None:
        query = query.where(Student.advisor_user_id == scope)
    latest = latest_for(db, db.scalars(query))

    pending, skipped, up_to_date = [], 0, 0
    for sid, academic in latest["academic"].items():
        attendance, interaction = latest["attendance"].get(sid), latest["interaction"].get(sid)
        features = features_from(academic, attendance, interaction)
        if not is_complete(features):
            skipped += 1
            continue

        newest_metric = max(academic.created_at, attendance.created_at, interaction.created_at)
        last = latest["prediction"].get(sid)
        if last and last.created_at >= newest_metric:
            up_to_date += 1
            continue
        pending.append((sid, features))

    # Model gọi MỘT lần cho cả lô; chỉ phần giải thích SHAP là theo từng người.
    probabilities = ml.predict_many([f for _, f in pending])
    version = ml.model_info()["version"] if pending else None
    for (sid, features), probability in zip(pending, probabilities):
        db.add(Prediction(student_id=sid, probability=probability, risk_level=ml.risk_level_for(probability),
                          is_at_risk=probability >= 0.5, model_version=version,
                          shap_top_factors=ml.explain(features)))
    db.commit()

    return {"predicted": len(pending), "skipped": skipped, "up_to_date": up_to_date}


def simulate(base: dict, changes: dict) -> dict:
    """
    MÔ PHỎNG "NẾU… THÌ": nguy cơ thay đổi thế nào khi cải thiện một vài chỉ số.

    Không ghi gì vào CSDL. Cố vấn dùng để trả lời câu hỏi thực tế — "nếu em ấy
    đi học đều lên 85% thì sao" — và chọn can thiệp vào chỗ có tác dụng nhất.
    Giá trị ngoài vùng dữ liệu model đã học được đánh dấu, vì ở đó dự đoán
    không còn đáng tin.
    """
    before = ml.predict(base)
    scenario = {**base, **{k: v for k, v in changes.items() if k in ml.RAW_FEATURES}}
    after = ml.predict(scenario)

    ranges = ml.training_ranges()
    outside = [ml.LABELS[f] for f, v in scenario.items()
               if f in ranges and not ranges[f][0] <= float(v) <= ranges[f][1]]

    return {"before": before, "after": after,
            "delta": round((after["probability"] - before["probability"]) * 100, 1),
            "outside_training_range": outside}


def trend(student: Student) -> list[dict]:
    """
    Diễn biến theo học kỳ cho biểu đồ ở hồ sơ: GPA, chuyên cần, và xác suất
    nguy cơ của lần dự đoán gần nhất tính đến hết kỳ đó.
    """
    points = []
    for i, academic in enumerate(student.academic_results):
        attendance = student.attendances[i] if i < len(student.attendances) else None
        # Dự đoán cuối cùng được chạy trước khi có lát cắt chỉ số tiếp theo.
        next_at = (student.academic_results[i + 1].created_at
                   if i + 1 < len(student.academic_results) else datetime.max)
        risk = [p for p in student.predictions if academic.created_at <= p.created_at < next_at]
        points.append({
            "semester": academic.semester,
            "gpa": academic.gpa,
            "attendance": attendance.attendance_rate if attendance else None,
            "risk": round(risk[-1].probability * 100, 1) if risk else None,
        })
    return points


# ===========================================================================
# Gợi ý can thiệp từ giải thích SHAP
# ===========================================================================
# Nối kết quả dự đoán với hành động: model đã chỉ ra yếu tố nào đẩy nguy cơ
# lên, bảng dưới quy mỗi nhóm yếu tố về một việc cụ thể cố vấn có thể làm.

PLAYBOOK = [
    ({"failed_subjects", "gpa", "academic_score"}, "peer_tutoring", "Phụ đạo các môn đang yếu",
     "Ghép nhóm học tập với sinh viên khá, ưu tiên các môn đã trượt hoặc điểm thấp."),
    ({"attendance_rate", "attendance_score"}, "parental_outreach", "Trao đổi với gia đình về chuyên cần",
     "Thông báo tình hình vắng học và tìm hiểu nguyên nhân: đi làm thêm, sức khoẻ hay mất động lực."),
    ({"assignment_missing", "assignment_submitted", "engagement_score"}, "academic_counseling",
     "Lập kế hoạch nộp bù bài tập", "Rà soát các bài còn thiếu, thống nhất hạn nộp bù cho từng môn."),
    ({"login_count", "video_views", "forum_posts", "learning_hours"}, "advising",
     "Theo dõi việc học trực tuyến",
     "Kiểm tra sinh viên có gặp khó khăn về thiết bị, kết nối hay cách dùng hệ thống học tập không."),
    ({"credits_completed"}, "advising", "Rà soát tiến độ tích luỹ tín chỉ",
     "Đối chiếu với chương trình đào tạo, lên kế hoạch học lại hợp lý."),
]


def suggest_interventions(factors: list[dict] | None, existing: list[Intervention] = ()) -> list[dict]:
    """
    Gợi ý việc cần làm từ các yếu tố đang LÀM TĂNG nguy cơ.

    Bỏ qua loại việc đang mở — không nhắc lại điều cố vấn đã làm.
    """
    open_categories = {i.category for i in existing if i.status != "completed"}
    suggestions, used = [], set()
    for factor in factors or []:
        if factor.get("effect") != "increase":
            continue
        for features, category, title, description in PLAYBOOK:
            if factor["feature"] in features and title not in used and category not in open_categories:
                used.add(title)
                suggestions.append({"category": category, "title": title, "description": description,
                                    "reason": factor.get("label", factor["feature"])})
    return suggestions

