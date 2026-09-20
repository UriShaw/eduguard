"""
EduGuard AI — Khởi chạy toàn bộ dự án.

Chạy:  python app.py
Dừng:  Ctrl+C

Script sẽ:
  1. Kích hoạt môi trường ảo Python (backend/.venv) nếu chưa kích hoạt.
  2. Khởi động Backend  (FastAPI)  tại http://127.0.0.1:8000
  3. Khởi động Frontend (Next.js) tại http://localhost:3000
  4. Hiển thị link truy cập và chờ cho đến khi nhấn Ctrl+C.
"""

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"

BACKEND_PORT = 8000
FRONTEND_PORT = 3000

# ── Màu cho terminal ─────────────────────────────────────────────────────────
GREEN = "\033[92m"
CYAN = "\033[96m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"


def banner() -> None:
    print(f"""
{CYAN}{BOLD}╔══════════════════════════════════════════════════╗
║               EduGuard AI  🎓                    ║
║   Hệ thống dự đoán nguy cơ bỏ học sinh viên      ║
╚══════════════════════════════════════════════════╝{RESET}
""")


def check_prerequisites() -> None:
    """Kiểm tra nhanh các điều kiện cần trước khi chạy."""
    errors: list[str] = []

    venv_python = BACKEND_DIR / ".venv" / "Scripts" / "python.exe"
    if not venv_python.exists():
        errors.append(
            f"Chưa tạo môi trường ảo. Chạy:\n"
            f"   cd backend\n"
            f"   python -m venv .venv\n"
            f"   .\\.venv\\Scripts\\Activate.ps1\n"
            f"   pip install -r requirements.txt"
        )

    node_modules = FRONTEND_DIR / "node_modules"
    if not node_modules.exists():
        errors.append(
            f"Chưa cài dependencies frontend. Chạy:\n"
            f"   cd frontend\n"
            f"   npm install"
        )

    db_env = ROOT / "database" / ".env"
    if not db_env.exists():
        errors.append(
            f"Chưa cấu hình database. Chạy:\n"
            f"   cd database\n"
            f"   copy .env.example .env\n"
            f"   (rồi mở .env, điền thông tin MySQL)"
        )

    if errors:
        print(f"{RED}{BOLD}✗ Chưa đủ điều kiện để chạy:{RESET}\n")
        for i, err in enumerate(errors, 1):
            print(f"  {YELLOW}{i}. {err}{RESET}\n")
        sys.exit(1)


def start_backend() -> subprocess.Popen:
    """Khởi động backend FastAPI bằng python trong .venv."""
    venv_python = str(BACKEND_DIR / ".venv" / "Scripts" / "python.exe")
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"

    proc = subprocess.Popen(
        [venv_python, "main.py", "serve", "--port", str(BACKEND_PORT)],
        cwd=str(BACKEND_DIR),
        env=env,
        stdout=sys.stdout,
        stderr=sys.stderr,
    )
    return proc


def start_frontend() -> subprocess.Popen:
    """Khởi động frontend Next.js dev server."""
    # Trên Windows dùng npm.cmd
    npm = "npm.cmd" if sys.platform == "win32" else "npm"
    env = os.environ.copy()

    proc = subprocess.Popen(
        [npm, "run", "dev", "--", "-p", str(FRONTEND_PORT)],
        cwd=str(FRONTEND_DIR),
        env=env,
        stdout=sys.stdout,
        stderr=sys.stderr,
    )
    return proc


def main() -> None:
    # Xử lý encoding console Windows
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    banner()
    check_prerequisites()

    processes: list[subprocess.Popen] = []

    def shutdown(*_: object) -> None:
        print(f"\n{YELLOW}⏳ Đang tắt...{RESET}")
        for proc in processes:
            try:
                proc.terminate()
            except OSError:
                pass
        for proc in processes:
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
        print(f"{GREEN}✓ Đã tắt toàn bộ.{RESET}")
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # ── Khởi động ─────────────────────────────────────────────────────────
    print(f"{CYAN}▶ Khởi động Backend (FastAPI)...{RESET}")
    backend_proc = start_backend()
    processes.append(backend_proc)

    # Đợi backend khởi động một chút trước khi bật frontend
    time.sleep(2)

    print(f"{CYAN}▶ Khởi động Frontend (Next.js)...{RESET}")
    frontend_proc = start_frontend()
    processes.append(frontend_proc)

    # Đợi thêm để frontend compile xong
    time.sleep(3)

    print(f"""
{GREEN}{BOLD}══════════════════════════════════════════════════
  ✓ EduGuard AI đang chạy!

  🌐 Giao diện:  {CYAN}http://localhost:{FRONTEND_PORT}{GREEN}

  Tài khoản mẫu:
    admin / admin123          (Quản trị viên)
    gv01  / giangvien123      (Giảng viên)
    sv01  / sinhvien123       (Sinh viên)

  Nhấn Ctrl+C để dừng.
══════════════════════════════════════════════════{RESET}
""")

    # Chờ cho đến khi một trong hai process thoát hoặc Ctrl+C
    try:
        while True:
            if backend_proc.poll() is not None:
                print(f"{RED}✗ Backend đã tắt (exit code {backend_proc.returncode}).{RESET}")
                shutdown()
            if frontend_proc.poll() is not None:
                print(f"{RED}✗ Frontend đã tắt (exit code {frontend_proc.returncode}).{RESET}")
                shutdown()
            time.sleep(1)
    except KeyboardInterrupt:
        shutdown()


if __name__ == "__main__":
    main()
