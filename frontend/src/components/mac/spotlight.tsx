"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CornerDownLeft, LogOut, Moon, MonitorSmartphone, RefreshCw, Search, Sun, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Kbd, Monogram } from "@/components/mac/controls";
import { RiskBadge } from "@/components/risk";
import { api, useApi, type Page, type StudentRow, type User } from "@/lib/api";
import { navigation } from "@/lib/navigation";
import { cn } from "cn";

interface Result {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
  run: () => void;
}

/** Bỏ dấu tiếng Việt để gõ "canh bao" vẫn tìm ra "Cảnh báo". */
const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export function Spotlight({ open, ...props }: {
  open: boolean;
  onClose: () => void;
  user: User;
  onLock: () => void;
}) {
  return <AnimatePresence>{open && <SpotlightPanel {...props} />}</AnimatePresence>;
}

function SpotlightPanel({ onClose, user, onLock }: {
  onClose: () => void;
  user: User;
  onLock: () => void;
}) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 180);
    return () => clearTimeout(timer);
  }, [query]);

  const staff = user.role !== "student";
  const { data: students, isLoading } = useApi<Page<StudentRow>>(
    staff && debounced.length >= 2 ? `/students?${new URLSearchParams({ keyword: debounced, per_page: "6" })}` : null,
  );

  const results = useMemo<Result[]>(() => {
    const go = (href: string) => () => { router.push(href); onClose(); };
    const q = fold(query.trim());
    const matches = (...texts: (string | undefined)[]) => !q || texts.some((t) => t && fold(t).includes(q));

    const pages: Result[] = navigation(user)
      .filter((item) => matches(item.label, item.keywords))
      .map((item) => ({
        id: `page:${item.href}`, group: "Trang", title: item.label, subtitle: item.section,
        icon: <span className={cn("grid size-7 place-items-center rounded-[8px] bg-gradient-to-b text-white", item.tint)}><item.icon className="size-4" /></span>,
        run: go(item.href),
      }));

    const actions: Result[] = [
      ...(user.role === "admin" ? [{ id: "act:new-student", title: "Thêm sinh viên mới", keywords: "tao them sinh vien",
        icon: <UserPlus className="size-4" />, run: go("/students?new=1") }] : []),
      ...(staff ? [{ id: "act:batch", title: "Cập nhật dự đoán hàng loạt", keywords: "chay du doan tat ca",
        icon: <RefreshCw className="size-4" />, run: async () => {
          onClose();
          const id = toast.loading("Đang cập nhật dự đoán…");
          try {
            const r = await api<{ predicted: number }>("/predictions/batch", { method: "POST" });
            toast.success(r.predicted ? `Đã dự đoán lại ${r.predicted} sinh viên` : "Mọi dự đoán đã mới nhất", { id });
          } catch (e) {
            toast.error((e as Error).message, { id });
          }
        } }] : []),
      { id: "act:light", title: "Giao diện sáng", keywords: "sang light theme", icon: <Sun className="size-4" />, run: () => { setTheme("light"); onClose(); } },
      { id: "act:dark", title: "Giao diện tối", keywords: "toi dark theme", icon: <Moon className="size-4" />, run: () => { setTheme("dark"); onClose(); } },
      { id: "act:system", title: "Giao diện theo hệ thống", keywords: "tu dong auto theme", icon: <MonitorSmartphone className="size-4" />, run: () => { setTheme("system"); onClose(); } },
      { id: "act:lock", title: "Khoá màn hình và đăng xuất", keywords: "dang xuat logout", icon: <LogOut className="size-4" />, run: () => { onClose(); onLock(); } },
    ].filter((a) => matches(a.title, a.keywords))
      .map((a) => ({
        id: a.id, title: a.title, run: a.run, group: "Thao tác",
        icon: <span className="grid size-7 place-items-center rounded-[8px] bg-muted text-foreground">{a.icon}</span>,
      }));

    const people: Result[] = (debounced.length >= 2 ? students?.items ?? [] : []).map((s) => ({
      id: `student:${s.student_id}`, group: "Sinh viên", title: s.full_name,
      subtitle: [s.student_code, s.class_name].filter(Boolean).join(" · "),
      icon: <Monogram name={s.full_name} className="size-7 text-xs" />,
      trailing: <RiskBadge level={s.risk_level} probability={s.probability} />,
      run: go(`/students/${s.student_id}`),
    }));

    return [...people, ...pages, ...actions];
  }, [query, debounced, students, user, staff, router, onClose, onLock, setTheme]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      results[cursor]?.run();
    } else if (event.key === "Escape") {
      onClose();
    }
  }

  let lastGroup = "";

  return (
    <motion.div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[14vh]"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                onMouseDown={onClose}>
      <motion.div
        role="dialog" aria-label="Spotlight"
        initial={{ opacity: 0, scale: 0.94, y: -12, filter: "blur(8px)" }}
        animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, scale: 0.97, y: -6, filter: "blur(4px)" }}
        transition={{ type: "spring", stiffness: 500, damping: 36 }}
        onMouseDown={(e) => e.stopPropagation()}
        className="glass-strong liquid-lens rim w-full max-w-[640px] overflow-hidden rounded-[26px]"
      >
        <div className="flex h-14 items-center gap-3 px-5">
          <Search className="size-5 text-muted-foreground" />
          <input autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setCursor(0); }} onKeyDown={onKeyDown}
                 placeholder={staff ? "Tìm sinh viên, trang, thao tác…" : "Tìm trang, thao tác…"}
                 className="h-full flex-1 bg-transparent text-xl font-light outline-none placeholder:text-muted-foreground/70" />
          {isLoading && <RefreshCw className="size-4 animate-spin text-muted-foreground" />}
          <Kbd>Esc</Kbd>
        </div>

        <AnimatePresence initial={false}>
          {results.length > 0 && (
            <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                        transition={{ type: "spring", stiffness: 400, damping: 38 }}
                        className="border-t border-border/60">
              <div ref={listRef} className="mac-scroll max-h-[52vh] overflow-y-auto p-2">
                {results.map((result, index) => {
                  const header = result.group !== lastGroup ? result.group : null;
                  lastGroup = result.group;
                  const active = index === cursor;
                  return (
                    <div key={result.id}>
                      {header && <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground">{header}</div>}
                      <button type="button" data-index={index} onMouseMove={() => setCursor(index)} onClick={result.run}
                              className={cn("relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left",
                                active && "text-primary-foreground")}>
                        {active && (
                          <motion.span layoutId="spotlight-cursor" transition={{ type: "spring", stiffness: 700, damping: 45 }}
                                       className="absolute inset-0 rounded-xl bg-primary shadow-[inset_0_1px_0_oklch(1_0_0/25%)]" />
                        )}
                        <span className="relative">{result.icon}</span>
                        <span className="relative min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{result.title}</span>
                          {result.subtitle && (
                            <span className={cn("block truncate text-xs", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                              {result.subtitle}
                            </span>
                          )}
                        </span>
                        <span className="relative">{active ? <CornerDownLeft className="size-4 opacity-80" /> : result.trailing}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {query && !results.length && !isLoading && (
          <div className="border-t border-border/60 px-5 py-6 text-center text-sm text-muted-foreground">
            Không tìm thấy “{query}”
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
