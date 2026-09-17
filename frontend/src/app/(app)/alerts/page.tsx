"use client";

import { motion } from "framer-motion";
import { CalendarX2, ClipboardX, PartyPopper, TrendingUp } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/app-shell";
import { RiskBadge } from "@/components/risk";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, useApi, type AlertCard, type Alerts } from "@/lib/api";

function Column({ icon: Icon, title, description, tone, items, render }: {
  icon: React.ElementType;
  title: string;
  description: string;
  tone: string;
  items: AlertCard[];
  render: (item: never) => React.ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg" style={{ background: `color-mix(in oklch, ${tone}, transparent 85%)` }}>
            <Icon className="size-4" style={{ color: tone }} />
          </span>
          {title}
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">{items.length}</span>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-2">
        {items.map((item, i) => (
          <motion.div key={`${item.student_id}-${i}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i, 10) * 0.03 }}>
            <Link href={`/students/${item.student_id}`}
                  className="block rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-accent/40">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{item.full_name}</div>
                  <div className="text-xs text-muted-foreground">{item.student_code} · {item.class_name ?? "—"}</div>
                </div>
                <RiskBadge level={item.risk_level} />
              </div>
              {render(item as never)}
            </Link>
          </motion.div>
        ))}
        {!items.length && (
          <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
            <PartyPopper className="size-6 opacity-50" /> Không có trường hợp nào.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AlertsPage() {
  const { data } = useApi<Alerts>("/alerts");

  return (
    <>
      <PageHeader
        title="Cảnh báo sớm"
        description="Ba nhóm việc dễ bị bỏ lỡ nhất — trả lời câu hỏi “hôm nay nên xử lý ai trước”."
      />
      {!data ? (
        <div className="grid gap-4 lg:grid-cols-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-96" />)}</div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <Column
            icon={TrendingUp} tone="var(--risk-critical)" title="Đang xấu đi nhanh" items={data.worsening}
            description="Nguy cơ tăng từ 15 điểm phần trăm trở lên so với lần dự đoán trước."
            render={(item: Alerts["worsening"][number]) => (
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="tabular-nums text-muted-foreground">{Math.round(item.from * 100)}%</span>
                <span className="h-px flex-1 bg-gradient-to-r from-muted-foreground/30 to-risk-critical" />
                <span className="font-semibold tabular-nums text-risk-critical">{Math.round(item.to * 100)}%</span>
                <span className="rounded bg-risk-critical/10 px-1.5 text-xs font-medium text-risk-critical">+{item.delta}</span>
              </div>
            )}
          />
          <Column
            icon={ClipboardX} tone="var(--risk-high)" title="Chưa có kế hoạch" items={data.unplanned}
            description="Nguy cơ Cao hoặc Rất cao nhưng chưa có việc can thiệp nào đang mở."
            render={(item: AlertCard) => (
              <p className="mt-2 text-xs text-muted-foreground">
                Xác suất {Math.round((item.probability ?? 0) * 100)}% — mở hồ sơ để xem gợi ý can thiệp.
              </p>
            )}
          />
          <Column
            icon={CalendarX2} tone="var(--risk-medium)" title="Việc quá hạn" items={data.overdue}
            description="Việc can thiệp đã qua hạn hoàn thành mà chưa xong."
            render={(item: Alerts["overdue"][number]) => (
              <p className="mt-2 text-sm">
                {item.title}
                <span className="block text-xs text-risk-critical">Hạn {formatDate(item.due_date)} · trễ {item.days_overdue} ngày</span>
              </p>
            )}
          />
        </div>
      )}
    </>
  );
}
