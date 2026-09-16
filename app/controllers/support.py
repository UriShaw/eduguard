"""
Biên bản gặp mặt và kế hoạch can thiệp.

Phân quyền ở đây tinh hơn các trang khác: sinh viên ĐƯỢC XEM biên bản và kế
hoạch của chính mình (đó là quyền được biết người ta đang làm gì để giúp
mình) nhưng KHÔNG được tạo hay sửa. Vì vậy route dùng mode="view" rồi tự
kiểm tra quyền ghi ở nhánh POST.
"""
from flask import (Blueprint, abort, flash, g, redirect, render_template,
                   request, url_for)
from flask_login import current_user, login_required

from app.forms.support import InterventionForm, MeetingForm
from app.security import student_required
from app.services import support

support_bp = Blueprint("support", __name__, url_prefix="/support")


@support_bp.route("/<int:student_id>/meetings", methods=["GET", "POST"])
@login_required
@student_required(mode="view")
def meetings(student_id: int):
    student = g.student
    can_edit = current_user.can_edit(student)

    form = MeetingForm()
    form.counselor_id.choices = support.counselor_choices()

    if request.method == "POST":
        if not can_edit:
            abort(403)
        if form.validate_on_submit():
            support.create_meeting(student, {
                "meeting_date": form.meeting_date.data,
                "meeting_type": form.meeting_type.data,
                "duration_minutes": form.duration_minutes.data,
                "counselor_id": form.counselor_id.data,
                "notes": form.notes.data,
            })
            flash("Đã lưu biên bản buổi gặp.", "success")
            return redirect(url_for("support.meetings", student_id=student_id))

    page = request.args.get("page", 1, type=int)
    return render_template(
        "support/meetings.html",
        student=student,
        form=form,
        can_edit=can_edit,
        pagination=support.meetings_of(student, page=page),
    )


@support_bp.route("/<int:student_id>/interventions", methods=["GET", "POST"])
@login_required
@student_required(mode="view")
def interventions(student_id: int):
    student = g.student
    can_edit = current_user.can_edit(student)

    form = InterventionForm()

    if request.method == "POST":
        if not can_edit:
            abort(403)
        if form.validate_on_submit():
            try:
                support.create_intervention(student, {
                    "category": form.category.data,
                    "title": form.title.data,
                    "description": form.description.data,
                    "due_date": form.due_date.data,
                })
            except support.SupportError as exc:
                flash(str(exc), "danger")
            else:
                flash("Đã thêm việc cần làm.", "success")
                return redirect(url_for("support.interventions", student_id=student_id))

    return render_template(
        "support/interventions.html",
        student=student,
        form=form,
        can_edit=can_edit,
        interventions=support.interventions_of(student),
    )


@support_bp.route("/interventions/<int:intervention_id>/status", methods=["POST"])
@login_required
def update_status(intervention_id: int):
    intervention = support.get_intervention(intervention_id)
    if intervention is None:
        abort(404)
    if not current_user.can_edit(intervention.student):
        abort(403)

    try:
        support.set_status(intervention, request.form.get("status", ""))
    except support.SupportError as exc:
        flash(str(exc), "danger")
    else:
        flash(f"Đã cập nhật: {intervention.status_label}.", "success")

    return redirect(url_for("support.interventions", student_id=intervention.student_id))
