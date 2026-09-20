"use client";

import { motion } from "framer-motion";
import {
  Bell, ChartNoAxesCombined, Check, Lock, Moon, PanelLeft, Search, Settings, Sun, SunMoon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";

import { Monogram } from "@/components/mac/controls";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS, type User } from "@/lib/api";
import { useNow } from "@/lib/client";
import { navigation, useModifierKeys } from "@/lib/navigation";
import { usePreferences, WALLPAPERS } from "@/lib/preferences";
import { cn } from "cn";

/** Thanh menu trên cùng màn hình, như macOS. Chỉ hiện trên màn hình rộng. */
export function MenuBar({ user, alerts, onSpotlight, onNotifications, onToggleSidebar, onToggleFullscreen, onLock, onShortcuts }: {
  user: User;
  alerts: number;
  onSpotlight: () => void;
  onNotifications: () => void;
  onToggleSidebar: () => void;
  onToggleFullscreen: () => void;
  onLock: () => void;
  onShortcuts: () => void;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { prefs, update } = usePreferences();
  const keys = useModifierKeys();

  return (
    <header className="fixed inset-x-0 top-0 z-50 hidden h-7 items-center gap-0.5 bg-black/12 px-2 text-[13px] text-white backdrop-blur-2xl backdrop-saturate-150 [text-shadow:0_1px_6px_oklch(0_0_0/25%)] lg:flex">
      <Menu label={<ChartNoAxesCombined className="size-4" strokeWidth={2.4} />} aria="Menu ứng dụng">
        <DropdownMenuLabel>EduGuard AI 2.0</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => router.push("/settings")}>Cài đặt…<DropdownMenuShortcut>{keys.alt}7</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onClick={onShortcuts}>Phím tắt…</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLock}>Khoá màn hình<DropdownMenuShortcut>{keys.alt}L</DropdownMenuShortcut></DropdownMenuItem>
      </Menu>

      <Menu label={<span className="font-bold">EduGuard</span>}>
        <DropdownMenuLabel>Xin chào, {user.full_name}</DropdownMenuLabel>
        <DropdownMenuItem onClick={onSpotlight}>Tìm kiếm…<DropdownMenuShortcut>{keys.mod}K</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onClick={onNotifications}>Trung tâm thông báo<DropdownMenuShortcut>{keys.alt}N</DropdownMenuShortcut></DropdownMenuItem>
      </Menu>

      {user.role !== "student" && (
        <Menu label="Tệp">
          {user.role === "admin" && <DropdownMenuItem onClick={() => router.push("/students?new=1")}>Sinh viên mới…</DropdownMenuItem>}
          {user.role === "admin" && <DropdownMenuItem onClick={() => router.push("/admin?new=1")}>Tài khoản mới…</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/data")}>Nhập dữ liệu từ file…</DropdownMenuItem>
          <DropdownMenuItem asChild><a href="/api/reports/export">Xuất báo cáo Excel</a></DropdownMenuItem>
        </Menu>
      )}

      <Menu label="Xem">
        <DropdownMenuItem onClick={onToggleSidebar}><PanelLeft />Ẩn/hiện thanh bên<DropdownMenuShortcut>{keys.alt}S</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onClick={onToggleFullscreen}>Toàn màn hình<DropdownMenuShortcut>{keys.alt}M</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Giao diện</DropdownMenuLabel>
        {([["light", "Sáng", Sun], ["dark", "Tối", Moon], ["system", "Theo hệ thống", SunMoon]] as const).map(([value, label, Icon]) => (
          <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
            <Icon />{label}{theme === value && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => update({ reduceMotion: !prefs.reduceMotion })}>
          Giảm chuyển động{prefs.reduceMotion && <Check className="ml-auto" />}
        </DropdownMenuItem>
      </Menu>

      <Menu label="Đi">
        {navigation(user).map((item) => (
          <DropdownMenuItem key={item.href} onClick={() => router.push(item.href)}>
            <item.icon />{item.label}<DropdownMenuShortcut>{keys.alt}{item.key}</DropdownMenuShortcut>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.back()}>Quay lại</DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.forward()}>Tiến tới</DropdownMenuItem>
      </Menu>

      <Menu label="Trợ giúp">
        <DropdownMenuItem onClick={onShortcuts}>Phím tắt bàn phím</DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/settings?tab=about")}>Về EduGuard AI</DropdownMenuItem>
      </Menu>

      <div className="flex-1" />

      <StatusButton label="Tìm kiếm" onClick={onSpotlight}><Search className="size-3.5" strokeWidth={2.4} /></StatusButton>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Giao diện" className="grid h-6 place-items-center rounded-md px-2 hover:bg-white/25 aria-expanded:bg-white/25">
            <SunMoon className="size-3.5" strokeWidth={2.4} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 p-2">
          <div className="grid grid-cols-3 gap-1.5">
            {([["light", "Sáng", Sun], ["dark", "Tối", Moon], ["system", "Tự động", SunMoon]] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" onClick={() => setTheme(value)}
                      className={cn("flex flex-col items-center gap-1 rounded-xl py-2 text-xs transition-colors",
                        theme === value ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80")}>
                <Icon className="size-4" />{label}
              </button>
            ))}
          </div>
          <div className="mt-3 mb-1.5 px-1 text-xs font-medium text-muted-foreground">Hình nền</div>
          <div className="flex justify-between gap-1.5 px-1">
            {WALLPAPERS.map((wp) => (
              <button key={wp.id} type="button" title={wp.name} onClick={() => update({ wallpaper: wp.id })}
                      className={cn("size-9 rounded-full ring-2 ring-offset-2 ring-offset-transparent transition-transform hover:scale-110",
                        prefs.wallpaper === wp.id ? "ring-primary" : "ring-transparent")}
                      style={{ background: wp.preview }} />
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <StatusButton label="Thông báo" onClick={onNotifications}>
        <span className="relative">
          <Bell className="size-3.5" strokeWidth={2.4} />
          {alerts > 0 && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -top-1 -right-1 size-2 rounded-full bg-red-500 ring-1 ring-white/60" />}
        </span>
      </StatusButton>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Tài khoản" className="flex h-6 items-center gap-1.5 rounded-md px-1.5 hover:bg-white/25 aria-expanded:bg-white/25">
            <Monogram name={user.full_name} className="size-4.5 text-[9px]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <div className="flex items-center gap-2.5 p-2">
            <Monogram name={user.full_name} className="size-9 text-sm" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{user.full_name}</div>
              <div className="text-xs text-muted-foreground">@{user.username} · {ROLE_LABELS[user.role]}</div>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/settings")}><Settings />Cài đặt tài khoản</DropdownMenuItem>
          <DropdownMenuItem onClick={onLock}><Lock />Khoá màn hình</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Clock />
    </header>
  );
}

function Menu({ label, aria, children }: { label: React.ReactNode; aria?: string; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={aria}
                className="flex h-6 items-center rounded-md px-2.5 outline-none hover:bg-white/25 aria-expanded:bg-white/30 dark:hover:bg-white/15">
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="w-60">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick}
            className="grid h-6 place-items-center rounded-md px-2 hover:bg-white/25 dark:hover:bg-white/15">
      {children}
    </button>
  );
}

function Clock() {
  const time = useNow(60_000);
  if (!time) return <span className="w-36" />;
  const now = new Date(time);
  return (
    <span className="px-2 tabular-nums">
      {now.toLocaleDateString("vi-VN", { weekday: "short", day: "numeric", month: "short" })}
      <span className="ml-2">{now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
    </span>
  );
}
