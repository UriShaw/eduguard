"""Dashboard, dữ liệu biểu đồ và xuất báo cáo."""
from flask import Blueprint, jsonify, render_template, request, send_file
from flask_login import login_required

from app.security import advisor_scope, staff_required
from app.services import analytics, reports, students

analytics_bp = Blueprint("analytics", __name__, url_prefix="/analytics")

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@analytics_bp.route("/dashboard")
@login_required
@staff_required
def dashboard():
    return render_template("analytics/dashboard.html", stats=analytics.summary(advisor_scope()))


@analytics_bp.route("/chart-data")
@login_required
@staff_required
def chart_data():
    """
    Dữ liệu cho biểu đồ, tách khỏi trang HTML.

    Trang tải xong và hiển thị được ngay, biểu đồ nạp sau — nếu gộp chung thì
    mỗi lần mở dashboard người dùng phải chờ cả phần tính toán nặng nhất.
    """
    scope = advisor_scope()
    scatter = analytics.scatter_points(scope)

    return jsonify({
        "success": True,
        "data": {
            "risk_distribution": analytics.summary(scope)["risk_distribution"],
            "by_class": analytics.at_risk_by_class(scope),
            "gpa": scatter["gpa"],
            "attendance": scatter["attendance"],
        },
    })


@analytics_bp.route("/reports")
@login_required
@staff_required
def reports_page():
    scope = advisor_scope()
    return render_template(
        "analytics/reports.html",
        classes=students.distinct_classes(scope),
        semesters=reports.available_semesters(scope),
    )


@analytics_bp.route("/reports/export")
@login_required
@staff_required
def export_report():
    class_name = request.args.get("class_name") or None
    semester = request.args.get("semester") or None

    workbook = reports.build_workbook(class_name, semester, advisor_scope())

    return send_file(workbook, mimetype=XLSX_MIME, as_attachment=True,
                     download_name=reports.filename_for(class_name, semester))
