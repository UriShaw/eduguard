"""Nhập dữ liệu hàng loạt từ file."""
from flask import (Blueprint, abort, flash, render_template, request,
                   send_file)
from flask_login import current_user, login_required

from app.security import admin_required, staff_required
from app.services import imports

imports_bp = Blueprint("imports", __name__, url_prefix="/imports")


def _handle_upload(importer, **kwargs) -> dict | None:
    """
    Đọc file rồi giao cho hàm nhập tương ứng.

    Dùng chung cho cả hai trang vì phần xử lý file tải lên, bắt lỗi và hiển
    thị thông báo là giống hệt nhau; chỉ hàm nhập ở giữa là khác.
    """
    upload = request.files.get("file")
    if not upload or not upload.filename:
        flash("Vui lòng chọn file để tải lên.", "warning")
        return None

    try:
        frame = imports.read_upload(upload)
        result = importer(frame, **kwargs)
    except imports.ImportError_ as exc:
        flash(str(exc), "danger")
        return None
    except Exception as exc:
        flash(f"Không đọc được file: {exc}", "danger")
        return None

    if result["success_count"]:
        flash(f"Đã nhập {result['success_count']} dòng.", "success")
    if result["error_count"]:
        flash(f"{result['error_count']} dòng không nhập được — xem chi tiết bên dưới.", "warning")
    if not result["success_count"] and not result["error_count"]:
        flash("File không có dòng dữ liệu nào.", "warning")

    return result


@imports_bp.route("/students", methods=["GET", "POST"])
@login_required
@admin_required
def students():
    result = _handle_upload(imports.import_students) if request.method == "POST" else None
    return render_template("imports/upload.html",
                           kind="students",
                           title="Nhập danh sách sinh viên",
                           description="Tải lên file CSV hoặc Excel chứa danh sách sinh viên cần thêm mới.",
                           required="student_code, full_name",
                           note="Sinh viên có mã đã tồn tại sẽ bị bỏ qua, không ghi đè dữ liệu cũ.",
                           columns=imports.STUDENT_COLUMNS,
                           result=result)


@imports_bp.route("/metrics", methods=["GET", "POST"])
@login_required
@staff_required
def metrics():
    result = (_handle_upload(imports.import_metrics, current_user=current_user)
              if request.method == "POST" else None)
    return render_template("imports/upload.html",
                           kind="metrics",
                           title="Nhập chỉ số học tập",
                           description="Tải lên GPA, chuyên cần và tương tác học tập cho nhiều sinh viên cùng lúc.",
                           required="student_code, semester, gpa, attendance_rate",
                           note="Các cột số để trống sẽ được tính bằng 0. Mỗi dòng tạo một bản ghi mới, không ghi đè.",
                           columns=imports.METRICS_COLUMNS,
                           result=result)


@imports_bp.route("/template/<kind>")
@login_required
@staff_required
def template(kind: str):
    try:
        buffer, filename = imports.template_csv(kind)
    except imports.ImportError_:
        abort(404)

    return send_file(buffer, mimetype="text/csv", as_attachment=True, download_name=filename)
