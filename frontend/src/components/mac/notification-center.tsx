"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BellOff, CalendarX2, ClipboardX, TrendingUp, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AnimatedNumber } from "@/components/mac/controls";
import { formatDate, type Alerts } from "@/lib/api";
import { cn } from "cn";

const MAX_EXPANDED = 4;

const GROUPS = [
  { key: "worsening", title: "Đang xấu đi nhanh", icon: TrendingUp, tint: "from-rose-400 to-red-600" },
  { key: "unplanned", title: "Chưa có kế hoạch", icon: ClipboardX, tint: "from-orange-300 to-orange-600" },
  { key: "overdue", title: "Việc quá hạn", icon: CalendarX2, tint: "from-amber-300 to-yellow-600" },
] as const;

/** Trung tâm thông báo: widget ngày giờ cùng các cảnh báo, gom theo nhóm và thu gọn được như macOS. */
export function NotificationCenter({ open, onClose, alerts }: {
  open: boolean;
  onClose: () => void;
  alerts: Alerts | undefined;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const total = alerts ? alerts.worsening.length + alerts.unplanned.length + alerts.overdue.length : 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      onClick={onClose} />
          <motion.aside
            aria-label="Trung tâm thông báo"
            initial={{ x: "110%", opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "110%", opacity: 0.5 }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            className="fixed top-9 right-2 z-50 w-[min(380px,calc(100vw-1rem))] space-y-2.5 p-1"
          >
            <div className="flex items-center justify-between px-2 pt-1">
              <span className="text-on-wallpaper text-sm font-semibold">Thông báo</span>
              <button type="button" onClick={onClose} aria-label="Đóng"
                      className="glass grid size-7 place-items-center rounded-full"><X className="size-4" /></button>
            </div>

            <ClockWidget total={total} />

            {!alerts ? (
              <div className="glass h-24 animate-pulse rounded-[22px]" />
            ) : total === 0 ? (
              <div className="glass rim flex flex-col items-center gap-2 rounded-[22px] p-8 text-sm text-muted-foreground">
                <BellOff className="size-6" /> Không có thông báo mới
              </div>
            ) : (
              GROUPS.map((group, groupIndex) => {
                const items = alerts[group.key];
                if (!items.length) return null;
                const isOpen = expanded === group.key;
                // Không cho khung cuộn: Chrome bỏ hiệu ứng mờ kính với phần tử nằm trong vùng cuộn.
                const visible = isOpen ? items.slice(0, MAX_EXPANDED) : items.slice(0, 1);
                return (
                  <motion.section key={group.key} layout initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
                                  transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.05 + groupIndex * 0.06 }}>
                    <div className="mb-1.5 flex items-center justify-between px-2">
                      <span className="text-on-wallpaper text-xs font-semibold">{group.title}</span>
                      {items.length > 1 && (
                        <button type="button" onClick={() => setExpanded(isOpen ? null : group.key)}
                                className="glass rounded-full px-2.5 py-0.5 text-[11px] font-medium">
                          {isOpen ? "Thu gọn" : `+${items.length - 1} khác`}
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <AnimatePresence initial={false}>
                        {visible.map((item, i) => (
                          <motion.div key={`${item.student_id}-${i}`} layout
                                      initial={{ opacity: 0, y: -12, scale: 0.96 }}
                                      animate={{ opacity: 1, y: 0, scale: 1 }}
                                      exit={{ opacity: 0, y: -10, scale: 0.96 }}
                                      transition={{ type: "spring", stiffness: 400, damping: 34 }}
                                      className="mb-1.5">
                            <Link href={`/students/${item.student_id}`} onClick={onClose}
                                  className="glass rim flex gap-3 rounded-[20px] p-3 transition-transform active:scale-[0.98]">
                              <span className={cn("grid size-9 shrink-0 place-items-center rounded-[10px] bg-gradient-to-b text-white", group.tint)}>
                                <group.icon className="size-4.5" />
                              </span>
                              <span className="min-w-0 flex-1 text-sm">
                                <span className="flex items-baseline justify-between gap-2">
                                  <span className="truncate font-semibold">{item.full_name}</span>
                                  <span className="shrink-0 text-[11px] text-muted-foreground">{item.class_name}</span>
                                </span>
                                <span className="block text-[13px] leading-snug text-muted-foreground">{describe(group.key, item)}</span>
                              </span>
                            </Link>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      {isOpen && items.length > MAX_EXPANDED && (
                        <Link href="/alerts" onClick={onClose} className="glass block rounded-full py-1.5 text-center text-xs font-medium">
                          Xem tất cả {items.length} trường hợp
                        </Link>
                      )}
                      {/* Các thẻ xếp chồng phía sau khi nhóm đang thu gọn. */}
                      {!isOpen && items.length > 1 && (
                        <div className="glass absolute inset-x-3 -bottom-1.5 -z-10 h-4 rounded-b-[16px] opacity-70" />
                      )}
                    </div>
                  </motion.section>
                );
              })
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function describe(group: (typeof GROUPS)[number]["key"], item: Alerts[keyof Alerts][number]) {
  if (group === "worsening") {
    const w = item as Alerts["worsening"][number];
    return `Nguy cơ tăng ${w.delta} điểm: ${Math.round(w.from * 100)}% → ${Math.round(w.to * 100)}%`;
  }
  if (group === "overdue") {
    const o = item as Alerts["overdue"][number];
    return `${o.title} — hạn ${formatDate(o.due_date)}, trễ ${o.days_overdue} ngày`;
  }
  return `Nguy cơ ${item.risk_level?.toLowerCase()} ${Math.round((item.probability ?? 0) * 100)}%, chưa có việc can thiệp`;
}

function ClockWidget({ total }: { total: number }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - ((now.getDay() + 6) % 7) + i);
    return d;
  });

  return (
    <div className="grid grid-cols-2 gap-2.5">
      <div className="glass rim flex flex-col justify-between rounded-[22px] p-4">
        <span className="text-xs font-semibold text-red-500 uppercase">{now.toLocaleDateString("vi-VN", { weekday: "long" })}</span>
        <span className="font-heading text-4xl font-light tabular-nums">
          {now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="text-xs text-muted-foreground">{now.toLocaleDateString("vi-VN", { day: "numeric", month: "long" })}</span>
      </div>
      <div className="glass rim rounded-[22px] p-3">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-xs font-semibold">Tháng {now.getMonth() + 1}</span>
          <span className="text-[10px] text-muted-foreground"><AnimatedNumber value={total} /> cảnh báo</span>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-[10px]">
          {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => <span key={d} className="text-muted-foreground">{d}</span>)}
          {days.map((d) => (
            <span key={d.toISOString()}
                  className={cn("grid aspect-square place-items-center rounded-full tabular-nums",
                    d.toDateString() === now.toDateString() && "bg-red-500 font-semibold text-white")}>
              {d.getDate()}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
