"""
Cấu hình logging tập trung cho cả ứng dụng web lẫn script chạy ngoài Flask.

Điều khiển bằng biến môi trường:
    LOG_LEVEL   DEBUG | INFO | WARNING | ERROR      (mặc định INFO)
    LOG_FORMAT  text (dễ đọc) | json (dễ thu thập)  (mặc định text)
    LOG_DIR     có đặt thì ghi thêm ra file xoay vòng; bỏ trống = chỉ stdout
"""
import json
import logging
import logging.handlers
import os
import sys

TEXT_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"


def _force_utf8_console() -> None:
    """
    Ép stdout và stderr sang UTF-8.

    Bắt buộc với dự án này: console Windows mặc định dùng bảng mã theo vùng
    (cp1258 cho tiếng Việt), không mã hoá được đủ chữ có dấu. Mọi lời gọi
    print hay log tiếng Việt sẽ ném UnicodeEncodeError và làm chết script —
    đã gặp thật khi chạy huấn luyện model.

    Đặt ở đây vì file này là nơi duy nhất trong dự án sở hữu luồng ra console,
    và mọi tiến trình (ứng dụng web lẫn script) đều nạp nó.
    """
    for stream in (sys.stdout, sys.stderr):
        # reconfigure có từ Python 3.7; luồng bị chuyển hướng ra file hoặc ống
        # dẫn có thể không có phương thức này, khi đó bỏ qua là đúng.
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except (ValueError, OSError):
                pass


_force_utf8_console()


class JsonFormatter(logging.Formatter):
    """Mỗi dòng log là một object JSON, kèm mọi field truyền qua `extra=`."""

    # Các thuộc tính LogRecord tự sinh; mọi thứ ngoài danh sách này là do
    # người gọi thêm vào bằng extra= nên cần đưa vào output.
    BUILTIN_ATTRS = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__)

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        for key, value in record.__dict__.items():
            if key not in self.BUILTIN_ATTRS and key not in payload:
                payload[key] = value

        return json.dumps(payload, ensure_ascii=False, default=str)


def _build_formatter() -> logging.Formatter:
    if os.getenv("LOG_FORMAT", "text").lower() == "json":
        return JsonFormatter()
    return logging.Formatter(TEXT_FORMAT)


def _build_handlers() -> list[logging.Handler]:
    formatter = _build_formatter()

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)
    handlers: list[logging.Handler] = [console]

    log_dir = os.getenv("LOG_DIR")
    if log_dir:
        os.makedirs(log_dir, exist_ok=True)
        file_handler = logging.handlers.RotatingFileHandler(
            os.path.join(log_dir, "app.log"),
            maxBytes=10 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        handlers.append(file_handler)

    return handlers


def configure_logging(app) -> None:
    """Gọi một lần trong create_app()."""
    level = os.getenv("LOG_LEVEL", "INFO").upper()

    root = logging.getLogger()
    root.setLevel(level)
    # Xoá handler cũ, nếu không mỗi lần dev server tự reload sẽ nhân đôi log.
    root.handlers.clear()
    for handler in _build_handlers():
        root.addHandler(handler)

    app.logger.setLevel(level)
    # Ứng dụng đã tự log từng request ở app/__init__.py, để werkzeug log thêm
    # một dòng nữa cho cùng request chỉ gây nhiễu.
    logging.getLogger("werkzeug").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """
    Logger cho script chạy độc lập (train model, seed dữ liệu) — những chỗ
    không có app Flask để gọi configure_logging() nhưng vẫn cần cùng định dạng.
    """
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    for handler in _build_handlers():
        logger.addHandler(handler)
    logger.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())
    logger.propagate = False
    return logger
