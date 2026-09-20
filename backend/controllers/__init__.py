"""
Tầng Controller — nhận request, kiểm tra quyền, gọi services, trả kết quả.

    dependencies.py  phiên CSDL, xác thực, phân quyền (dùng chung mọi route)
    auth.py          đăng nhập, đăng xuất
    students.py      hồ sơ sinh viên và mọi thứ gắn với một sinh viên
    analytics.py     tổng quan, cảnh báo sớm, công cụ dữ liệu, báo cáo
    admin.py         tài khoản đăng nhập, cán bộ tư vấn

Không có truy vấn CSDL hay luật nghiệp vụ nào được viết ở tầng này.
"""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from services import ServiceError
from services.reports import ImportFileError


def register(app: FastAPI) -> None:
    from controllers import admin, analytics, auth, students

    app.include_router(auth.router)
    app.include_router(students.router)
    app.include_router(analytics.router)
    app.include_router(admin.router)

    @app.exception_handler(ServiceError)
    @app.exception_handler(ImportFileError)
    async def business_error(_request: Request, exc: Exception):
        # Lỗi nghiệp vụ mang thông điệp dành cho người dùng: trả 400 kèm nguyên văn.
        return JSONResponse(status_code=400, content={"detail": str(exc)})
