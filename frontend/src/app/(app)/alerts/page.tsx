"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CalendarX2, ChevronRight, ClipboardX, PartyPopper, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PageHeader } from "@/components/app-shell";
import { AnimatedNumber, EmptyState, Monogram, Segmented, SOFT_SPRING } from "@/components/mac/controls";
import { RiskBadge } from "@/components/risk";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, useApi, type AlertCard, type Alerts } from "@/lib/api";
import { cn } from "cn";

type Key = keyof Alerts;

const COLUMNS: { key: Key; title: string; description: string; icon: React.ElementType; tint: string }[] = [
  { key: "worsening", title: "Đang xấu đi nhanh", icon: TrendingUp, tint: "from-rose-400 to-red-600",
    description: "Nguy cơ tăng từ 15 điểm phần trăm trở lên so với lần dự đoán trước." },
  { key: "unplanned", title: "Chưa có kế hoạch", icon: ClipboardX, tint: "from-orange-300 to-orange-600",
    description: "Nguy cơ Cao hoặc Rất cao nhưng chưa có việc can thiệp nào đang mở." },
  { key: "overdue", title: "Việc quá hạn", icon: CalendarX2, tint: "from-amber-300 to-yellow-600",
    description: "Việc can thiệp đã qua hạn hoàn thành mà chưa xong." },
];

export default function AlertsPage() {
  const { data } = useApi<Alerts>("/alerts");
  // Màn hình hẹp chỉ hiện một cột mỗi lúc, chọn bằng segmented control.
  const [focus, setFocus] = useState<Key>("worsening");

  return (
    <>
      <PageHeader title="Cảnh báo sớm" description="Ba nhóm việc dễ bị bỏ lỡ nhất — trả lời câu hỏi “hôm nay nên xử lý ai trước”." />

      {data && (
        <Segmented value={focus} onChange={setFocus} className="mb-4 lg:hidden"
                   options={COLUMNS.map((c) => ({ value: c.key, label: <>{c.title} <span className="opacity-60">{data[c.key].length}</span></> }))} />
      )}

      {!data ? (
        <div className="grid gap-4 lg:grid-cols-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-96 rounded-[22px]" />)}</div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {COLUMNS.map((column, index) => (
            <motion.div key={column.key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ ...SOFT_SPRING, delay: index * 0.07 }}
                        className={cn(column.key !== focus && "hidden lg:block")}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2.5">
                    <span className={cn("grid size-8 place-items-center rounded-[10px] bg-gradient-to-b text-white shadow-[inset_0_1px_0_oklch(1_0_0/35%)]", column.tint)}>
                      <column.icon className="size-4" />
                    </span>
                    {column.title}
                    <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold"><AnimatedNumber value={data[column.key].length} /></span>
                  </CardTitle>
                  <CardDescription>{column.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1.5 px-2.5">
                  <AnimatePresence initial={false}>
                    {data[column.key].map((item, i) => (
                      <motion.div key={`${item.student_id}-${i}`} layout
                                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                                  transition={{ ...SOFT_SPRING, delay: Math.min(i, 12) * 0.025 }}>
                        <Link href={`/students/${item.student_id}`}
                              className="group flex items-start gap-3 rounded-2xl p-2.5 transition-colors hover:bg-muted/70 active:scale-[0.99]">
                          <Monogram name={item.full_name} className="size-9 text-sm" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate font-medium">{item.full_name}</div>
                                <div className="text-xs text-muted-foreground">{item.student_code} · {item.class_name ?? "—"}</div>
                              </div>
                              <RiskBadge level={item.risk_level} />
                            </div>
                            <Detail kind={column.key} item={item} />
                          </div>
                          <ChevronRight className="mt-2.5 size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {!data[column.key].length && <EmptyState icon={PartyPopper} title="Không có trường hợp nào" />}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </>
  );
}

function Detail({ kind, item }: { kind: Key; item: AlertCard }) {
  if (kind === "worsening") {
    const w = item as Alerts["worsening"][number];
    return (
      <div className="mt-2 flex items-center gap-2 text-sm">
        <span className="tabular-nums text-muted-foreground">{Math.round(w.from * 100)}%</span>
        <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <motion.span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-risk-medium to-risk-critical"
                       initial={{ width: `${w.from * 100}%` }} animate={{ width: `${w.to * 100}%` }}
                       transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }} />
        </span>
        <span className="font-semibold tabular-nums text-risk-critical">{Math.round(w.to * 100)}%</span>
        <span className="rounded-full bg-risk-critical/12 px-1.5 text-xs font-semibold text-risk-critical">+{w.delta}</span>
      </div>
    );
  }
  if (kind === "overdue") {
    const o = item as Alerts["overdue"][number];
    return (
      <p className="mt-1.5 text-sm">
        {o.title}
        <span className="block text-xs font-medium text-risk-critical">Hạn {formatDate(o.due_date)} · trễ {o.days_overdue} ngày</span>
      </p>
    );
  }
  return (
    <p className="mt-1.5 text-xs text-muted-foreground">
      Xác suất {Math.round((item.probability ?? 0) * 100)}% — mở hồ sơ để xem gợi ý can thiệp.
    </p>
  );
}
