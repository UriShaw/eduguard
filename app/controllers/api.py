"""
REST API.

Định dạng phản hồi thống nhất cho MỌI endpoint:
    {"success": true,  "data": ...}
    {"success": false, "error": "..."}
Nhờ vậy client chỉ cần một nhánh xử lý lỗi duy nhất.

Giới hạn đã biết: xác thực bằng session cookie, phù hợp gọi từ chính giao
diện web. Client bên ngoài gọi server-to-server cần API key hoặc JWT — chưa
triển khai, và không nên giả vờ là đã có.
"""
from flask import Blueprint, abort, jsonify, request
from flask_login import current_user, login_required

from app.extensions import csrf, db
from app.ml.features import RAW_FEATURES
from app.models import Prediction, Student
from app.security import advisor_scope, staff_required
from app.services import analytics, predictions, students

api_bp = Blueprint("api", __name__, url_prefix="/api")

# API dùng token phiên qua cookie nhưng không có form HTML để gắn CSRF token.
# Miễn CSRF ở đây là có chủ ý và đi kèm giới hạn ghi nhận ở đầu file.
csrf.exempt(api_bp)

MAX_PAGE_SIZE = 100


def ok(data, status: int = 200):
    return jsonify({"success": True, "data": data}), status


def fail(error, status: int = 400):
    return jsonify({"success": False, "error": error}), status


def _page_args() -> tuple[int, int]:
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 20, type=int), MAX_PAGE_SIZE)
    return page, per_page


def _paginated(pagination, key: str, serialize) -> dict:
    return {
        key: [serialize(item) for item in pagination.items],
        "page": pagination.page,
        "pages": pagination.pages,
        "total": pagination.total,
    }


@api_bp.route("/students")
@login_required
@staff_required
def list_students():
    page, per_page = _page_args()
    pagination = students.search(
        keyword=request.args.get("keyword", ""),
        status=request.args.get("status", ""),
        class_name=request.args.get("class_name", ""),
        advisor_user_id=advisor_scope(),
        page=page,
        per_page=per_page,
    )
    return ok(_paginated(pagination, "students", lambda s: s.to_dict()))


@api_bp.route("/students/<int:student_id>")
@login_required
def get_student(student_id: int):
    student = students.get(student_id)
    if student is None:
        return fail("Không tìm thấy sinh viên", 404)
    if not current_user.can_view(student):
        abort(403)

    data = student.to_dict()
    latest = student.latest_prediction()
    data["latest_prediction"] = latest.to_dict() if latest else None
    return ok(data)


def _validate_features(payload: dict) -> tuple[dict | None, list[str]]:
    """
    Ép kiểu và kiểm tra giới hạn, thu thập HẾT lỗi rồi mới trả về.

    Trả về lỗi đầu tiên gặp phải sẽ bắt client sửa từng cái một qua nhiều
    lượt gọi; giới hạn ở đây khớp đúng với biểu mẫu web.
    """
    values, errors = {}, []

    for name in RAW_FEATURES:
        if name not in payload:
            errors.append(f"Thiếu trường bắt buộc: {name}")
            continue
        try:
            values[name] = float(payload[name])
        except (TypeError, ValueError):
            errors.append(f"Trường '{name}' phải là số, nhận được {payload[name]!r}")

    if errors:
        return None, errors

    if not 0 <= values["gpa"] <= 10:
        errors.append("gpa phải nằm trong khoảng 0 đến 10")
    if not 0 <= values["attendance_rate"] <= 100:
        errors.append("attendance_rate phải nằm trong khoảng 0 đến 100")
    for name in RAW_FEATURES:
        if name not in ("gpa", "attendance_rate") and values[name] < 0:
            errors.append(f"{name} không thể âm")

    return (None, errors) if errors else (values, [])


@api_bp.route("/predictions", methods=["POST"])
@login_required
@staff_required
def create_prediction():
    """
    Chạy dự đoán.

    Có student_id thì kết quả được lưu vào lịch sử của sinh viên đó (trả 201);
    không có thì chỉ tính và trả về, không ghi gì (trả 200).
    """
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return fail("Nội dung gửi lên phải là JSON hợp lệ", 400)

    features, errors = _validate_features(payload)
    if errors:
        return fail(errors, 400)

    student_id = payload.get("student_id")
    if student_id is None:
        return ok(predictions.run(features, with_explanation=False))

    student = students.get(int(student_id))
    if student is None:
        return fail("Không tìm thấy sinh viên", 404)
    if not current_user.can_edit(student):
        abort(403)

    try:
        record = predictions.run_and_save(student, features)
    except FileNotFoundError as exc:
        # 503 chứ không phải 500: hệ thống vẫn chạy đúng, chỉ là chưa có model.
        return fail(str(exc), 503)

    return ok(record.to_dict(), 201)


@api_bp.route("/predictions")
@login_required
@staff_required
def list_predictions():
    page, per_page = _page_args()
    student_id = request.args.get("student_id", type=int)

    query = db.session.query(Prediction)

    if student_id is not None:
        student = students.get(student_id)
        if student is None:
            return fail("Không tìm thấy sinh viên", 404)
        if not current_user.can_view(student):
            abort(403)
        query = query.filter(Prediction.student_id == student_id)
    elif not current_user.is_admin():
        # Giảng viên không nêu sinh viên cụ thể thì chỉ thấy phần mình phụ trách.
        query = query.join(Student, Prediction.student_id == Student.student_id).filter(
            Student.advisor_user_id == current_user.user_id
        )

    pagination = query.order_by(Prediction.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return ok(_paginated(pagination, "predictions", lambda p: p.to_dict()))


@api_bp.route("/statistics")
@login_required
@staff_required
def statistics():
    return ok(analytics.summary(advisor_scope()))
