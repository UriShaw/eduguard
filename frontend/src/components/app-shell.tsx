"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell, ChevronLeft, ChevronRight, Lock, PanelLeft, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { Kbd, Monogram, SOFT_SPRING, SPRING } from "@/components/mac/controls";
import { Dock } from "@/components/mac/dock";
import { MenuBar } from "@/components/mac/menu-bar";
import { NotificationCenter } from "@/components/mac/notification-center";
import { Spotlight } from "@/components/mac/spotlight";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ROLE_LABELS, useApi, type Alerts, type User } from "@/lib/api";
import { isActive, navigation, useModifierKeys, type NavItem } from "@/lib/navigation";
import { cn } from "cn";

// ===== Ngữ cảnh =====

interface Shell {
  user: User;
  openSpotlight: () => void;
  lock: () => void;
}

const ShellContext = createContext<Shell | null>(null);

function useShell(): Shell {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("Chỉ dùng được bên trong AppShell");
  return shell;
}

/** Người dùng đang đăng nhập. Chỉ gọi được bên trong AppShell, nơi user đã chắc chắn có. */
export function useUser(): User {
  return useShell().user;
}

export { useShell };

// ===== Khung ứng dụng =====

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [spotlight, setSpotlight] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [locking, setLocking] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const { data: user } = useApi<User>("/auth/me");
  // Sinh viên không có quyền xem cảnh báo nên không gọi.
  const { data: alerts } = useApi<Alerts>(user && user.role !== "student" ? "/alerts" : null, { refreshInterval: 120_000 });
  const alertCount = alerts ? alerts.worsening.length + alerts.unplanned.length + alerts.overdue.length : 0;

  const openSpotlight = useCallback(() => setSpotlight(true), []);
  const closeSpotlight = useCallback(() => setSpotlight(false), []);
  const closeNotifications = useCallback(() => setNotifications(false), []);

  const lock = useCallback(() => {
    setLocking(true);
    // Đợi màn khoá phủ kín rồi mới đăng xuất. Tải lại toàn trang để xoá sạch cache SWR
    // của phiên cũ — người đăng nhập kế tiếp trên cùng máy không thấy lại dữ liệu đó.
    setTimeout(async () => {
      await api("/auth/logout", { method: "POST" }).catch(() => undefined);
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    }, 550);
  }, []);

  const onScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrolled(event.currentTarget.scrollTop > 64);
  }, []);

  // Trang mới bắt đầu từ đầu, như mở một cửa sổ mới.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  // Phím tắt toàn cục.
  useEffect(() => {
    if (!user) return;
    const items = navigation(user);
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const typing = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSpotlight((open) => !open);
        return;
      }
      if (!event.altKey || event.metaKey || event.ctrlKey || typing) return;
      // Dùng event.code: trên Mac, Option + phím cho ra ký tự đặc biệt ở event.key.
      const digit = event.code.startsWith("Digit") ? event.code.slice(5) : null;
      const item = digit && items.find((i) => i.key === digit);
      const actions: Record<string, () => void> = {
        KeyS: () => setCollapsed((c) => !c),
        KeyM: () => setFullscreen((f) => !f),
        KeyN: () => setNotifications((n) => !n),
        KeyL: lock,
      };
      if (item) {
        event.preventDefault();
        router.push(item.href);
      } else if (actions[event.code]) {
        event.preventDefault();
        actions[event.code]();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user, router, lock]);

  // Vệt sáng trên thẻ đi theo con trỏ: một bộ lắng nghe cho cả trang thay vì mỗi thẻ một cái.
  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>("[data-slot=card]");
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    card.style.setProperty("--my", `${event.clientY - rect.top}px`);
  }, []);

  if (!user) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={SOFT_SPRING}
                    className="glass rim grid size-20 place-items-center rounded-[24px]">
          <span className="size-7 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
        </motion.div>
      </div>
    );
  }

  const items = navigation(user);
  const current = items.find((i) => isActive(i.href, pathname));
  const title = current?.label ?? (pathname.startsWith("/students/") ? "Hồ sơ sinh viên" : "EduGuard");

  return (
    <ShellContext.Provider value={{ user, openSpotlight, lock }}>
      <MenuBar user={user} alerts={alertCount} onSpotlight={openSpotlight} onNotifications={() => setNotifications((n) => !n)}
               onToggleSidebar={() => setCollapsed((c) => !c)} onToggleFullscreen={() => setFullscreen((f) => !f)}
               onLock={lock} onShortcuts={() => setShortcuts(true)} />

      {/* Cửa sổ ứng dụng. Chế độ toàn màn hình nới lề ra sát mép và giấu Dock. */}
      <div className={cn("fixed inset-0 flex transition-[padding] duration-500 ease-(--ease-mac) lg:top-7",
        fullscreen ? "lg:p-0" : "lg:px-5 lg:pt-4 lg:pb-[92px]")}>
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 24 }}
          animate={{ opacity: locking ? 0 : 1, scale: locking ? 0.96 : 1, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
          className={cn("glass-strong relative mx-auto flex w-full max-w-[1680px] overflow-hidden transition-[border-radius] duration-500 lg:rim",
            fullscreen ? "lg:rounded-none" : "lg:rounded-[30px]")}
        >
          <Sidebar items={items} user={user} alerts={alertCount} collapsed={collapsed}
                   onClose={lock} onMinimize={() => setCollapsed(true)} onZoom={() => setFullscreen((f) => !f)}
                   onSpotlight={openSpotlight} />

          <div className="flex min-w-0 flex-1 flex-col">
            <Toolbar title={title} scrolled={scrolled} collapsed={collapsed} alerts={alertCount}
                     onToggleSidebar={() => setCollapsed((c) => !c)} onSpotlight={openSpotlight}
                     onNotifications={() => setNotifications(true)} onClose={lock} onZoom={() => setFullscreen((f) => !f)} />

            <div ref={scrollRef} onScroll={onScroll} onPointerMove={onPointerMove}
                 className="mac-scroll relative flex-1 overflow-x-hidden overflow-y-auto">
              <AnimatePresence mode="wait" initial={false}>
                <motion.main
                  key={pathname}
                  initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -8, filter: "blur(4px)", transition: { duration: 0.14 } }}
                  transition={{ type: "spring", stiffness: 300, damping: 32 }}
                  className="mx-auto max-w-[1400px] px-4 pt-2 pb-28 sm:px-7 lg:pb-10"
                >
                  {children}
                </motion.main>
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>

      <Dock items={items} alerts={alertCount} hidden={fullscreen} onSpotlight={openSpotlight} onLock={lock} />
      <Spotlight open={spotlight} onClose={closeSpotlight} user={user} onLock={lock} />
      <NotificationCenter open={notifications} onClose={closeNotifications} alerts={alerts} />
      <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} items={items} />

      {/* Màn khoá: làm mờ dần mọi thứ trước khi chuyển về trang đăng nhập. */}
      <AnimatePresence>
        {locking && (
          <motion.div className="fixed inset-0 z-[100] grid place-items-center backdrop-blur-3xl"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING}
                        className="glass rim grid size-20 place-items-center rounded-full text-white">
              <Lock className="size-8" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ShellContext.Provider>
  );
}

// ===== Cửa sổ =====

/** Ba nút đèn giao thông: đỏ khoá màn hình, vàng thu thanh bên, xanh phóng toàn màn hình. Biểu tượng hiện khi rê chuột. */
function TrafficLights({ onClose, onMinimize, onZoom }: { onClose: () => void; onMinimize: () => void; onZoom: () => void }) {
  const lights = [
    { label: "Khoá màn hình", color: "bg-[#ff5f57]", glyph: "×", onClick: onClose },
    { label: "Thu thanh bên", color: "bg-[#febc2e]", glyph: "−", onClick: onMinimize },
    { label: "Toàn màn hình", color: "bg-[#28c840]", glyph: "⤢", onClick: onZoom },
  ];
  return (
    <div className="group/lights hidden items-center gap-2 lg:flex">
      {lights.map((light) => (
        <button key={light.label} type="button" aria-label={light.label} title={light.label} onClick={light.onClick}
                className={cn("grid size-3 place-items-center rounded-full text-[9px] leading-none font-black text-black/55 shadow-[inset_0_0_0_0.5px_oklch(0_0_0/20%)] active:brightness-75",
                  light.color)}>
          <span className="opacity-0 transition-opacity group-hover/lights:opacity-100">{light.glyph}</span>
        </button>
      ))}
    </div>
  );
}

function Sidebar({ items, user, alerts, collapsed, onClose, onMinimize, onZoom, onSpotlight }: {
  items: NavItem[];
  user: User;
  alerts: number;
  collapsed: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onZoom: () => void;
  onSpotlight: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const sections = [...new Set(items.map((i) => i.section))];
  const keys = useModifierKeys();

  return (
    <AnimatePresence initial={false}>
      {!collapsed && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 256, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 36 }}
          className="hidden shrink-0 overflow-hidden lg:block"
        >
          {/* Thanh bên nổi tách khỏi mép cửa sổ, như macOS Tahoe. */}
          <div className="rim m-2.5 mr-0 flex h-[calc(100%-1.25rem)] w-[246px] flex-col rounded-[22px] bg-sidebar shadow-[inset_0_1px_0_oklch(1_0_0/35%),0_8px_24px_-16px_hsl(var(--shadow-color)/0.3)]">
            <div className="flex h-12 items-center px-4">
              <TrafficLights onClose={onClose} onMinimize={onMinimize} onZoom={onZoom} />
            </div>

            <button type="button" onClick={onSpotlight}
                    className="mx-3 flex h-8 items-center gap-2 rounded-[10px] bg-muted px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/70">
              <Search className="size-4" /> Tìm kiếm <Kbd className="ml-auto bg-background/50">{keys.mod}K</Kbd>
            </button>

            <nav className="mac-scroll mt-3 flex-1 space-y-4 overflow-y-auto px-3 pb-3">
              {sections.map((section) => (
                <div key={section}>
                  <div className="px-2.5 pb-1 text-[11px] font-semibold text-muted-foreground/80">{section}</div>
                  <div className="space-y-0.5">
                    {items.filter((i) => i.section === section).map((item) => {
                      const active = isActive(item.href, pathname);
                      const badge = item.href === "/alerts" ? alerts : 0;
                      return (
                        <Link key={item.href} href={item.href}
                              className={cn("group relative flex h-8 items-center gap-2.5 rounded-[9px] px-2.5 text-sm transition-colors",
                                active ? "text-primary-foreground" : "text-foreground/85 hover:bg-sidebar-accent")}>
                          {active && (
                            <motion.span layoutId="sidebar-active" transition={SPRING}
                                         className="absolute inset-0 rounded-[9px] bg-primary shadow-[inset_0_1px_0_oklch(1_0_0/25%),0_2px_8px_-2px_color-mix(in_oklch,var(--primary),transparent_40%)]" />
                          )}
                          <item.icon className={cn("relative size-4", !active && "text-primary")} strokeWidth={2} />
                          <span className="relative flex-1 truncate">{item.label}</span>
                          {badge > 0 && (
                            <span className={cn("relative rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                              active ? "bg-white/25" : "bg-muted text-muted-foreground")}>{badge}</span>
                          )}
                          <span className={cn("relative text-[10px] opacity-0 transition-opacity group-hover:opacity-60", active && "text-primary-foreground")}>
                            {keys.alt}{item.key}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="m-2 flex items-center gap-2.5 rounded-[14px] p-2 text-left transition-colors hover:bg-sidebar-accent aria-expanded:bg-sidebar-accent">
                  <Monogram name={user.full_name} className="size-8 text-sm" />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-sm font-medium">{user.full_name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{ROLE_LABELS[user.role]} · @{user.username}</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuItem onClick={() => router.push("/settings")}><Settings />Cài đặt</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onClose}><Lock />Khoá màn hình</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function Toolbar({ title, scrolled, collapsed, alerts, onToggleSidebar, onSpotlight, onNotifications, onClose, onZoom }: {
  title: string;
  scrolled: boolean;
  collapsed: boolean;
  alerts: number;
  onToggleSidebar: () => void;
  onSpotlight: () => void;
  onNotifications: () => void;
  onClose: () => void;
  onZoom: () => void;
}) {
  const router = useRouter();

  return (
    <div className={cn("relative z-20 flex h-[52px] shrink-0 items-center gap-1.5 px-3 transition-[background-color,box-shadow] duration-300 sm:px-4",
      scrolled && "bg-(--glass) shadow-[0_0.5px_0_var(--border)] backdrop-blur-xl")}>
      <AnimatePresence initial={false}>
        {collapsed && (
          <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} exit={{ opacity: 0, width: 0 }}
                      className="mr-2 overflow-hidden">
            <TrafficLights onClose={onClose} onMinimize={onToggleSidebar} onZoom={onZoom} />
          </motion.div>
        )}
      </AnimatePresence>

      <ToolbarButton label="Thanh bên" onClick={onToggleSidebar} className="hidden lg:grid"><PanelLeft /></ToolbarButton>
      <div className="flex rounded-full">
        <ToolbarButton label="Quay lại" onClick={() => router.back()}><ChevronLeft /></ToolbarButton>
        <ToolbarButton label="Tiến tới" onClick={() => router.forward()}><ChevronRight /></ToolbarButton>
      </div>

      <AnimatePresence mode="wait">
        <motion.span key={title + scrolled}
                     initial={{ opacity: 0, y: scrolled ? 8 : 0 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                     transition={{ duration: 0.2 }}
                     className={cn("ml-1 truncate font-semibold", scrolled ? "text-[15px]" : "text-[15px] lg:text-sm lg:font-medium lg:text-muted-foreground")}>
          {title}
        </motion.span>
      </AnimatePresence>

      <div className="flex-1" />

      <button type="button" onClick={onSpotlight}
              className="hidden h-8 w-56 items-center gap-2 rounded-full bg-(--field) px-3 text-sm text-muted-foreground shadow-[inset_0_1px_2px_oklch(0.2_0.02_264/8%)] ring-1 ring-foreground/[0.06] transition-colors hover:bg-(--glass-strong) md:flex">
        <Search className="size-4" /> Tìm kiếm
      </button>
      <ToolbarButton label="Tìm kiếm" onClick={onSpotlight} className="md:hidden"><Search /></ToolbarButton>
      <ToolbarButton label="Thông báo" onClick={onNotifications}>
        <span className="relative">
          <Bell />
          {alerts > 0 && (
            <span className="absolute -top-1.5 -right-2 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
              {alerts > 99 ? "99+" : alerts}
            </span>
          )}
        </span>
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({ label, onClick, className, children }: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.button type="button" aria-label={label} title={label} onClick={onClick} whileTap={{ scale: 0.88 }}
                   className={cn("grid size-8 place-items-center rounded-full text-foreground/75 transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-[18px]",
                     className)}>
      {children}
    </motion.button>
  );
}

function ShortcutsDialog({ open, onOpenChange, items }: { open: boolean; onOpenChange: (open: boolean) => void; items: NavItem[] }) {
  const { mod, alt } = useModifierKeys();
  const rows: [string, string][] = [
    [`${mod}K`, "Mở Spotlight"],
    ...items.map((i) => [`${alt}${i.key}`, i.label] as [string, string]),
    [`${alt}S`, "Ẩn/hiện thanh bên"],
    [`${alt}M`, "Toàn màn hình"],
    [`${alt}N`, "Trung tâm thông báo"],
    [`${alt}L`, "Khoá màn hình"],
    ["Chuột phải", "Menu thao tác trên dòng sinh viên"],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Phím tắt</DialogTitle>
          <DialogDescription>Làm việc nhanh hơn mà không cần rời bàn phím.</DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-border/60">
          {rows.map(([key, label]) => (
            <div key={key} className="flex items-center justify-between py-2 text-sm">
              <span>{label}</span><Kbd>{key}</Kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===== Tiêu đề trang =====

export function PageHeader({ title, description, actions, icon }: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SOFT_SPRING}
                className="mb-6 flex flex-wrap items-end justify-between gap-4 pt-2">
      <div className="flex min-w-0 items-center gap-4">
        {icon}
        <div className="min-w-0">
          <h1 className="font-heading text-[28px] leading-tight font-bold tracking-tight sm:text-[32px]">{title}</h1>
          {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  );
}
