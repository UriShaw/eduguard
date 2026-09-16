"""Quản lý hồ sơ sinh viên và nhập chỉ số học tập."""
from flask import (Blueprint, flash, g, redirect, render_template, request,
                   url_for)
from flask_login import current_user, login_required

from app.forms.student import MetricsForm, StudentForm
from app.security import admin_required, advisor_scope, student_required
from app.services import latest, metrics, students

students_bp = Blueprint("students", __name__, url_prefix="/students")


def _form_data(form: StudentForm) -> dict:
    data = {name: getattr(form, name).data for name in students.EDITABLE_FIELDS
            if hasattr(form, name)}
    data["student_code"] = data["student_code"].strip()
    data["full_name"] = data["full_name"].strip()
    if data.get("email"):
        data["email"] = data["email"].strip()
    return data


@students_bp.route("/")
@login_required
def index():
    """
    Danh sách sinh viên.

    Tài khoản sinh viên không có danh sách để xem — chuyển thẳng tới hồ sơ
    của chính họ.
    """
    if current_user.is_student():
        if current_user.student_id:
            return redirect(url_for("students.detail", student_id=current_user.student_id))
        flash("Tài khoản của bạn chưa được gắn với hồ sơ sinh viên nào.", "warning")
        return redirect(url_for("public.home"))

    filters = {
        "keyword": request.args.get("keyword", "").strip(),
        "status": request.args.get("status", ""),
        "class_name": request.args.get("class_name", ""),
    }
    page = request.args.get("page", 1, type=int)

    pagination = students.search(**filters, advisor_user_id=advisor_scope(),
                                 page=page, per_page=10)

    # Một truy vấn gộp cho cả trang thay vì gọi lẻ theo từng sinh viên.
    overview = latest.overview_for(s.student_id for s in pagination.items)

    return render_template(
        "students/index.html",
        pagination=pagination,
        overview=overview,
        filters=filters,
        classes=students.distinct_classes(advisor_scope()),
    )


@students_bp.route("/<int:student_id>")
@login_required
@student_required(mode="view")
def detail(student_id: int):
    """Hồ sơ đầy đủ: thông tin cá nhân, lịch sử chỉ số, lịch sử dự đoán."""
    student = g.student
    return render_template(
        "students/detail.html",
        student=student,
        history=metrics.history(student),
        predictions=student.predictions.limit(10).all(),
        can_edit=current_user.can_edit(student),
    )


@students_bp.route("/new", methods=["GET", "POST"])
@login_required
@admin_required
def create():
    form = StudentForm()
    form.advisor_user_id.choices = students.lecturer_choices()

    if form.validate_on_submit():
        try:
            student = students.create(_form_data(form))
        except students.StudentError as exc:
            flash(str(exc), "danger")
        else:
            flash(f"Đã thêm sinh viên {student.student_code}.", "success")
            return redirect(url_for("students.detail", student_id=student.student_id))

    return render_template("students/form.html", form=form, student=None)


@students_bp.route("/<int:student_id>/edit", methods=["GET", "POST"])
@login_required
@admin_required
@student_required(mode="edit")
def edit(student_id: int):
    student = g.student
    form = StudentForm(obj=student)
    form.advisor_user_id.choices = students.lecturer_choices()

    if not form.is_submitted():
        form.advisor_user_id.data = student.advisor_user_id or 0

    if form.validate_on_submit():
        try:
            students.update(student, _form_data(form))
        except students.StudentError as exc:
            flash(str(exc), "danger")
        else:
            flash("Đã lưu thay đổi.", "success")
            return redirect(url_for("students.detail", student_id=student.student_id))

    return render_template("students/form.html", form=form, student=student)


@students_bp.route("/<int:student_id>/delete", methods=["POST"])
@login_required
@admin_required
@student_required(mode="edit")
def delete(student_id: int):
    code = g.student.student_code
    students.delete(g.student)
    flash(f"Đã xoá sinh viên {code} cùng toàn bộ dữ liệu liên quan.", "success")
    return redirect(url_for("students.index"))


@students_bp.route("/<int:student_id>/metrics", methods=["GET", "POST"])
@login_required
@student_required(mode="edit")
def record_metrics(student_id: int):
    """Nhập một lát cắt chỉ số mới cho sinh viên."""
    student = g.student
    form = MetricsForm()

    if form.validate_on_submit():
        data = {name: field.data for name, field in form._fields.items()
                if name not in ("csrf_token", "submit")}
        metrics.record_snapshot(student, data)
        flash("Đã ghi nhận chỉ số mới.", "success")
        return redirect(url_for("students.detail", student_id=student.student_id))

    if not form.is_submitted():
        # Điền sẵn tên học kỳ gần nhất: người nhập thường ghi tiếp cùng kỳ.
        last = student.latest_academic()
        if last:
            form.semester.data = last.semester

    return render_template("students/metrics.html", form=form, student=student)
