"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  BellRing, ChartNoAxesCombined, Database, GraduationCap, LayoutDashboard, LogOut, Menu, Sparkles, UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api, useApi, type Alerts, type User } from "@/lib/api";
import { cn } from "@/lib/utils";

const ROLE_LABELS = { admin: "Quản trị viên", lecturer: "Giảng viên", student: "Sinh viên" } as const;

const UserContext = createContext<User | null>(null);

/** Người dùng đang đăng nhập. Chỉ gọi được bên trong AppShell, nơi user đã chắc chắn có. */
export function useUser(): User {
  const user = useContext(UserContext);
  if (!user) throw new Error("useUser phải được dùng bên trong AppShell");
  return user;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

function navigation(user: User, alerts: number): NavItem[] {
  if (user.role === "student") {
    return [{ href: `/students/${user.student_id}`, label: "Hồ sơ của tôi", icon: UserRound }];
  }
  return [
    { href: "/", label: "Tổng quan", icon: LayoutDashboard },
    { href: "/alerts", label: "Cảnh báo sớm", icon: BellRing, badge: alerts },
    { href: "/students", label: "Sinh viên", icon: GraduationCap },
    { href: "/predict", label: "Dự đoán nhanh", icon: Sparkles },
    { href: "/data", label: "Dữ liệu & báo cáo", icon: Database },
  ];
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <ChartNoAxesCombined className="size-5" />
      </div>
      <div className="leading-tight">
        <div className="font-semibold tracking-tight">EduGuard AI</div>
        <div className="text-[11px] text-muted-foreground">Cảnh báo sớm bỏ học</div>
      </div>
    </Link>
  );
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {active && (
              // Nền chỉ báo trượt giữa các mục khi chuyển trang, cho thấy ta vừa đi từ đâu tới đâu.
              <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-accent"
                           transition={{ type: "spring", stiffness: 400, damping: 32 }} />
            )}
            <item.icon className="relative size-4" />
            <span className="relative flex-1">{item.label}</span>
            {!!item.badge && (
              <span className="relative rounded-full bg-risk-critical px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: user } = useApi<User>("/auth/me");
  // Số cảnh báo cho huy hiệu ở thanh bên; sinh viên không có quyền xem nên không gọi.
  const { data: alerts } = useApi<Alerts>(user && user.role !== "student" ? "/alerts" : null,
                                          { refreshInterval: 120_000 });
  const alertCount = alerts ? alerts.worsening.length + alerts.unplanned.length + alerts.overdue.length : 0;

  if (!user) {
    return (
      <div className="flex min-h-screen">
        <aside className="hidden w-64 border-r bg-sidebar p-4 lg:block"><Skeleton className="h-10 w-40" /></aside>
        <main className="flex-1 space-y-4 p-8"><Skeleton className="h-8 w-60" /><Skeleton className="h-64" /></main>
      </div>
    );
  }

  const items = navigation(user, alertCount);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <UserContext.Provider value={user}>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-sidebar p-4 lg:flex">
          <Brand />
          <div className="mt-8 flex-1"><NavLinks items={items} /></div>
          <p className="px-3 text-[11px] leading-relaxed text-muted-foreground">
            Dự đoán là căn cứ để bắt đầu trò chuyện, không phải phán quyết về sinh viên.
          </p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur lg:px-8">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Mở menu">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-4">
                <SheetTitle className="sr-only">Điều hướng</SheetTitle>
                <Brand />
                <div className="mt-8"><NavLinks items={items} onNavigate={() => setMobileOpen(false)} /></div>
              </SheetContent>
            </Sheet>

            <div className="flex-1" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-10 gap-2.5 px-2">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {(user.full_name.trim().split(/\s+/).pop()?.[0] ?? "?").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden text-left leading-tight sm:block">
                    <div className="text-sm font-medium">{user.full_name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {user.full_name === ROLE_LABELS[user.role] ? `@${user.username}` : ROLE_LABELS[user.role]}
                    </div>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs text-muted-foreground">@{user.username}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                  <LogOut /> Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <AnimatePresence mode="wait">
            <motion.main
              key={pathname}
              className="flex-1 px-4 py-6 lg:px-8 lg:py-8"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              {children}
            </motion.main>
          </AnimatePresence>
        </div>
      </div>
    </UserContext.Provider>
  );
}

export function PageHeader({ title, description, actions }: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
