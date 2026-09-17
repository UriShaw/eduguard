import { NextResponse, type NextRequest } from "next/server";

/**
 * Kiểm tra lạc quan: chưa có cookie đăng nhập thì chuyển ngay về trang đăng nhập,
 * tránh để trang nhấp nháy giao diện rồi mới bị đẩy đi.
 *
 * Đây KHÔNG phải lớp phân quyền — cookie có thể hết hạn hoặc bị làm giả. Mọi
 * kiểm tra thật nằm ở backend, nơi token được xác minh ở từng request.
 */
export function proxy(request: NextRequest) {
  const loggedIn = request.cookies.has("eduguard_token");
  const onLogin = request.nextUrl.pathname === "/login";

  if (!loggedIn && !onLogin) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Bỏ qua API (backend tự xử lý) và tài nguyên tĩnh.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
