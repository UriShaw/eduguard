import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// Be Vietnam Pro được thiết kế cho tiếng Việt: dấu thanh không bị dính hay lệch
// như ở nhiều phông Latin thông thường.
const vietnam = Be_Vietnam_Pro({
  variable: "--font-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "EduGuard AI", template: "%s · EduGuard AI" },
  description: "Hệ thống dự đoán và cảnh báo sớm nguy cơ bỏ học của sinh viên",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${vietnam.variable} h-full antialiased`}>
      <body className="min-h-full">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
