"""
Trang chủ công khai.

Trang này không đòi đăng nhập, nên nó chỉ được hiển thị SỐ LIỆU TỔNG HỢP.
Danh sách sinh viên nguy cơ cao — kèm họ tên, mã và GPA — chỉ hiện ra khi có
người đã đăng nhập với quyền phù hợp: đó là dữ liệu cá nhân nhạy cảm, và
"đang có nguy cơ bỏ học" là thông tin có thể gây hại cho chính sinh viên nếu
lọt ra ngoài.
"""
from flask import Blueprint, jsonify, render_template
from flask_login import current_user

from app.services import analytics

public_bp = Blueprint("public", __name__)


@public_bp.route("/")
def home():
    can_see_names = current_user.is_authenticated and not current_user.is_student()

    return render_template(
        "public/home.html",
        summary=analytics.public_summary(),
        at_risk_students=analytics.top_at_risk(limit=5) if can_see_names else [],
        can_see_names=can_see_names,
    )


@public_bp.route("/home-chart-data")
def home_chart_data():
    """
    Dữ liệu biểu đồ cho trang chủ — chỉ con số tổng hợp, không có danh tính.

    Số sinh viên nguy cơ cao theo lớp vẫn là dữ liệu tổng hợp, nhưng một lớp
    chỉ vài người thì con số đó gần như chỉ đích danh. Vì vậy phần theo lớp
    chỉ trả về cho người đã đăng nhập.
    """
    summary = analytics.public_summary()
    data = {
        "risk_summary": {
            "Nguy cơ cao": summary["high"],
            "Nguy cơ trung bình": summary["medium"],
            "Nguy cơ thấp": summary["low"],
        },
        "by_class": {"labels": [], "values": []},
    }

    if current_user.is_authenticated and not current_user.is_student():
        data["by_class"] = analytics.at_risk_by_class()

    return jsonify({"success": True, "data": data})
