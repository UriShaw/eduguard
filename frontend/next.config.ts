import type { NextConfig } from "next";

// Trình duyệt gọi /api/* trên CHÍNH máy chủ Next.js, Next chuyển tiếp sang FastAPI.
// Nhờ cùng nguồn, cookie đăng nhập httpOnly tự đi kèm mà không cần mở CORS.
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
