"""Chạy dự đoán, xem kết quả và lịch sử."""
from flask import (Blueprint, abort, flash, g, redirect, render_template,
                   request, url_for)
from flask_login import current_user, login_required

from app.forms.prediction import PredictionForm
from app.ml.registry import MISSING_MODEL_MESSAGE
from app.security import staff_required, student_required
from app.services import metrics, predictions, students

predictions_bp = Blueprint("predictions", __name__, url_prefix="/predictions")


@predictions_bp.route("/", methods=["GET", "POST"])
@login_required
@staff_required
def new():
    """
    Thử nhanh: nhập tay chỉ số, xem kết quả, KHÔNG lưu.

    Dùng khi cố vấn muốn thử "nếu chuyên cần tăng lên 80% thì sao" mà không
    muốn làm bẩn lịch sử dự đoán của sinh viên.
    """
    form = PredictionForm()

    if form.validate_on_submit():
        try:
            result = predictions.run(form.to_features())
        except FileNotFoundError:
            flash(MISSING_MODEL_MESSAGE, "danger")
        else:
            return render_template("predictions/result.html",
                                    result=result, factors=result["factors"],
                                    student=None, saved=False, previous=None)

    return render_template("predictions/new.html", form=form, student=None, prefilled=False)


@predictions_bp.route("/students/<int:student_id>", methods=["GET", "POST"])
@login_required
@student_required(mode="edit")
def for_student(student_id: int):
    """Dự đoán cho một sinh viên, có điền sẵn chỉ số gần nhất và có lưu lịch sử."""
    student = g.student
    form = PredictionForm()
    snapshot = metrics.latest_features(student)

    if not form.is_submitted():
        for name, value in snapshot["values"].items():
            if value is not None:
                getattr(form, name).data = value

    if form.validate_on_submit():
        try:
            record = predictions.run_and_save(student, form.to_features())
        except FileNotFoundError:
            flash(MISSING_MODEL_MESSAGE, "danger")
        except predictions.PredictionError as exc:
            flash(str(exc), "danger")
        else:
            return redirect(url_for("predictions.result", prediction_id=record.prediction_id))

    return render_template("predictions/new.html", form=form, student=student,
                            prefilled=snapshot["has_data"], complete=snapshot["is_complete"])


@predictions_bp.route("/find")
@login_required
@staff_required
def find():
    """Tìm sinh viên theo mã rồi chuyển sang biểu mẫu dự đoán của người đó."""
    code = request.args.get("code", "").strip()
    if not code:
        flash("Vui lòng nhập mã sinh viên.", "warning")
        return redirect(url_for("predictions.new"))

    student = students.get_by_code(code)
    if student is None:
        flash(f"Không tìm thấy sinh viên có mã '{code}'.", "danger")
        return redirect(url_for("predictions.new"))

    if not current_user.can_edit(student):
        # Nói rõ lý do thay vì trả 403 trống: đây là thao tác tra cứu thông
        # thường, và giảng viên cần biết mình cần liên hệ ai để được cấp quyền.
        flash("Sinh viên này không thuộc danh sách bạn phụ trách.", "danger")
        return redirect(url_for("predictions.new"))

    return redirect(url_for("predictions.for_student", student_id=student.student_id))


@predictions_bp.route("/result/<int:prediction_id>")
@login_required
def result(prediction_id: int):
    record = predictions.get(prediction_id)
    if record is None:
        abort(404)
    if not current_user.can_view(record.student):
        abort(403)

    return render_template(
        "predictions/result.html",
        result={
            "prediction_id": record.prediction_id,
            "probability": float(record.probability),
            "risk_level": record.risk_level,
            "is_at_risk": record.is_at_risk,
            "model_version": record.model_version,
        },
        factors=record.shap_top_factors or [],
        student=record.student,
        previous=predictions.previous_of(record),
        saved=True,
    )


@predictions_bp.route("/history/<int:student_id>")
@login_required
@student_required(mode="view")
def history(student_id: int):
    page = request.args.get("page", 1, type=int)
    return render_template(
        "predictions/history.html",
        student=g.student,
        pagination=predictions.history(g.student, page=page),
    )
