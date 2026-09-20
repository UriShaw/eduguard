/**
 * Một nguồn điều hướng duy nhất cho Dock, thanh bên, thanh menu, Spotlight và
 * phím tắt — thêm một trang chỉ phải khai báo ở đây.
 */
import {
  BellRing, Database, GraduationCap, LayoutGrid, type LucideIcon, Settings, ShieldCheck, Sparkles, UserRound,
} from "lucide-react";

import type { Role, User } from "@/lib/api";
import { useClientValue } from "@/lib/client";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Màu biểu tượng trên Dock — mỗi ứng dụng một sắc, như Dock thật. */
  tint: string;
  section: "Theo dõi" | "Công cụ" | "Hệ thống";
  roles: Role[];
  /** Phím số đi kèm Alt/⌥ để mở nhanh. */
  key: string;
  keywords?: string;
}

const ITEMS: NavItem[] = [
  { href: "/", label: "Tổng quan", icon: LayoutGrid, tint: "from-sky-400 to-blue-600", section: "Theo dõi",
    roles: ["admin", "lecturer"], key: "1", keywords: "dashboard thống kê" },
  { href: "/alerts", label: "Cảnh báo sớm", icon: BellRing, tint: "from-rose-400 to-red-600", section: "Theo dõi",
    roles: ["admin", "lecturer"], key: "2", keywords: "nguy cơ quá hạn" },
  { href: "/students", label: "Sinh viên", icon: GraduationCap, tint: "from-emerald-400 to-teal-600", section: "Theo dõi",
    roles: ["admin", "lecturer"], key: "3", keywords: "danh sách hồ sơ" },
  { href: "/predict", label: "Dự đoán nhanh", icon: Sparkles, tint: "from-violet-400 to-purple-600", section: "Công cụ",
    roles: ["admin", "lecturer"], key: "4", keywords: "mô hình thử" },
  { href: "/data", label: "Dữ liệu & báo cáo", icon: Database, tint: "from-amber-300 to-orange-500", section: "Công cụ",
    roles: ["admin", "lecturer"], key: "5", keywords: "nhập xuất excel csv" },
  { href: "/admin", label: "Quản trị", icon: ShieldCheck, tint: "from-slate-400 to-slate-700", section: "Hệ thống",
    roles: ["admin"], key: "6", keywords: "tài khoản người dùng cán bộ tư vấn" },
  { href: "/settings", label: "Cài đặt", icon: Settings, tint: "from-zinc-300 to-zinc-500", section: "Hệ thống",
    roles: ["admin", "lecturer", "student"], key: "7", keywords: "giao diện mật khẩu hình nền" },
];

export function navigation(user: User): NavItem[] {
  const items = ITEMS.filter((item) => item.roles.includes(user.role));
  if (user.role === "student") {
    return [{ href: `/students/${user.student_id}`, label: "Hồ sơ của tôi", icon: UserRound, tint: "from-sky-400 to-blue-600",
              section: "Theo dõi", roles: ["student"], key: "1" }, ...items.map((i) => ({ ...i, key: "2" }))];
  }
  return items;
}

export function isActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

const PC_KEYS = { mod: "Ctrl+", alt: "Alt+", mac: false };
const MAC_KEYS = { mod: "⌘", alt: "⌥", mac: true };

/** Nhãn phím bổ trợ theo hệ điều hành: ⌘/⌥ trên Mac, Ctrl/Alt ở nơi khác. Trả về đối tượng cố định. */
export function modifierLabels() {
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  return mac ? MAC_KEYS : PC_KEYS;
}

/** Như modifierLabels nhưng an toàn khi render ở máy chủ. */
export function useModifierKeys() {
  return useClientValue(modifierLabels, PC_KEYS);
}
