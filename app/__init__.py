"""Application factory."""
import time

from flask import Flask, g, jsonify, redirect, render_template, request, url_for
from flask_login import current_user
from sqlalchemy import text

from app.config import get_config
from app.extensions import csrf, db, login_manager
from app.logging_setup import configure_logging


def create_app(env: str | None = None) -> Flask:
    app = Flask(__name__)
    app.config.from_object(get_config(env))

    configure_logging(app)

    db.init_app(app)
    csrf.init_app(app)
    login_manager.init_app(app)

    # Nạp model để SQLAlchemy biết đủ bảng trước truy vấn đầu tiên.
    from app import models  # noqa: F401

    register_blueprints(app)
    register_error_handlers(app)
    register_request_logging(app)
    register_template_helpers(app)

    @app.route("/health")
    def health():
        """
        Kiểm tra sức khoẻ, không cần đăng nhập.

        Có truy vấn CSDL thật chứ không trả "ok" vô điều kiện: tiến trình web
        còn sống nhưng mất kết nối CSDL thì ứng dụng đã hỏng, và đó đúng là
        trường hợp giám sát cần phát hiện.
        """
        try:
            db.session.execute(text("SELECT 1"))
        except Exception as exc:
            app.logger.error("health_check_failed", extra={"error": str(exc)})
            return jsonify({"status": "degraded", "database": "unreachable"}), 503

        return jsonify({"status": "ok", "database": "ok"}), 200

    return app


def register_blueprints(app: Flask) -> None:
    from app.api.routes import api_bp
    from app.views.analytics import analytics_bp
    from app.views.auth import auth_bp
    from app.views.imports import imports_bp
    from app.views.predictions import predictions_bp
    from app.views.public import public_bp
    from app.views.students import students_bp
    from app.views.support import support_bp

    app.register_blueprint(public_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(students_bp)
    app.register_blueprint(predictions_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(support_bp)
    app.register_blueprint(imports_bp)
    app.register_blueprint(api_bp)


def register_error_handlers(app: Flask) -> None:
    def wants_json() -> bool:
        return request.path.startswith("/api/")

    @app.errorhandler(401)
    def unauthorized(_error):
        if wants_json():
            return jsonify({"success": False, "error": "Chưa đăng nhập"}), 401
        return redirect(url_for("auth.login", next=request.path))

    @app.errorhandler(403)
    def forbidden(_error):
        # Ghi lại mọi lần bị chặn: một tài khoản liên tục đâm vào 403 ở nhiều
        # đường dẫn khác nhau là dấu hiệu dò quyền, cần thấy được trong log.
        app.logger.warning(
            "access_denied",
            extra={
                "path": request.path,
                "method": request.method,
                "user_id": getattr(current_user, "user_id", None),
                "user_role": getattr(current_user, "role", None),
                "remote_addr": request.remote_addr,
            },
        )
        if wants_json():
            return jsonify({"success": False, "error": "Không có quyền truy cập"}), 403
        return render_template("errors/403.html"), 403

    @app.errorhandler(404)
    def not_found(_error):
        if wants_json():
            return jsonify({"success": False, "error": "Không tìm thấy"}), 404
        return render_template("errors/404.html"), 404

    @app.errorhandler(500)
    def server_error(_error):
        app.logger.exception("internal_server_error")
        if wants_json():
            return jsonify({"success": False, "error": "Lỗi hệ thống"}), 500
        return render_template("errors/500.html"), 500


def register_request_logging(app: Flask) -> None:
    """Một dòng log cho mỗi request: ai gọi gì, mất bao lâu, kết quả ra sao."""

    @app.before_request
    def start_timer():
        g.request_started_at = time.perf_counter()

    @app.after_request
    def log_request(response):
        started = g.get("request_started_at")
        duration_ms = round((time.perf_counter() - started) * 1000, 2) if started else None

        log = app.logger.warning if response.status_code >= 400 else app.logger.info
        log(
            "http_request",
            extra={
                "method": request.method,
                "path": request.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "remote_addr": request.remote_addr,
                "user_id": getattr(current_user, "user_id", None),
                "user_role": getattr(current_user, "role", None),
            },
        )
        return response


def register_template_helpers(app: Flask) -> None:
    """Bộ lọc và biến dùng chung cho mọi template."""

    risk_classes = {
        "Thấp": "risk-low",
        "Trung bình": "risk-medium",
        "Cao": "risk-high",
        "Rất cao": "risk-critical",
    }

    @app.template_filter("risk_class")
    def risk_class(risk_level: str) -> str:
        return risk_classes.get(risk_level, "risk-unknown")

    @app.template_filter("percent")
    def percent(value, digits: int = 1) -> str:
        """0.8432 -> '84.3%'. Dùng ở mọi nơi hiển thị xác suất."""
        if value is None:
            return "-"
        return f"{float(value) * 100:.{digits}f}%"

    @app.context_processor
    def inject_globals():
        return {"current_user": current_user}
