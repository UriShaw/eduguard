import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";

import { LiquidLensFilter, Wallpaper } from "@/components/mac/wallpaper";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Providers } from "@/lib/preferences";
import "./globals.css";

// Be Vietnam Pro được thiết kế cho tiếng Việt: dấu thanh không bị dính hay lệch
// như ở nhiều phông Latin thông thường. Máy Apple dùng SF Pro của hệ thống.
const vietnam = Be_Vietnam_Pro({
  variable: "--font-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "EduGuard AI", template: "%s · EduGuard AI" },
  description: "Hệ thống dự đoán và cảnh báo sớm nguy cơ bỏ học của sinh viên",
};

export const viewport: Viewport = {
  themeColor: "#1f2a44",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Theme và hình nền được gắn vào <html> ở phía trình duyệt nên thuộc tính lệch với HTML của máy chủ là cố ý.
    <html lang="vi" className={`${vietnam.variable} h-full antialiased`} data-wallpaper="sequoia" suppressHydrationWarning>
      <body className="min-h-full overflow-hidden">
        <Providers>
          <Wallpaper />
          <LiquidLensFilter />
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
          <Toaster position="top-right" offset={{ top: 40 }} />
        </Providers>
      </body>
    </html>
  );
}
