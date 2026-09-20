"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, BellRing, Cpu, RefreshCw, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader, useUser } from "@/components/app-shell";
import { ClassBar, RiskDonut, RiskScatter } from "@/components/charts";
import { AnimatedNumber, SOFT_SPRING } from "@/components/mac/controls";
import { RISK_STYLE } from "@/components/risk";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, RISK_LEVELS, useApi, type Dashboard } from "@/lib/api";
import { useClientValue } from "@/lib/client";

const container = { show: { transition: { staggerChildren: 0.06 } } };
const widget = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: SOFT_SPRING },
};

function greeting() {
  const hour = new Date().getHours();
  return hour < 11 ? "Chào buổi sáng" : hour < 14 ? "Chào buổi trưa" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";
}

export default function DashboardPage() {
  const user = useUser();
  const router = useRouter();
  const { data, mutate } = useApi<Dashboard>(user.role === "student" ? null : "/dashboard");
  const [running, setRunning] = useState(false);
  const hello = useClientValue(greeting, "Xin chào");

  useEffect(() => {
    if (user.role === "student") router.replace(`/students/${user.student_id}`);
  }, [user, router]);

  async function runBatch() {
    setRunning(true);
    try {
      const r = await api<{ predicted: number; up_to_date: number; skipped: number }>("/predictions/batch", { method: "POST" });
      toast.success(r.predicted ? `Đã cập nhật dự đoán cho ${r.predicted} sinh viên` : "Mọi dự đoán đã cập nhật",
        { description: `${r.up_to_date} đã khớp chỉ số mới nhất · ${r.skipped} thiếu chỉ số` });
      mutate();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setRunning(false);
    }
  }

  if (!data) {
    return (
      <div className="space-y-6 pt-2">
        <Skeleton className="h-10 w-72 rounded-full" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-36 rounded-[22px]" />)}</div>
        <Skeleton className="h-80 rounded-[22px]" />
      </div>
    );
  }

  const { summary } = data;

  return (
    <>
      <PageHeader
        title={`${hello}, ${user.full_name}`}
        description={user.role === "admin" ? "Tình hình nguy cơ bỏ học toàn trường" : "Tình hình sinh viên bạn phụ trách"}
        actions={
          <Button variant="outline" onClick={runBatch} disabled={running}>
            <RefreshCw className={running ? "animate-spin" : ""} /> Cập nhật dự đoán
          </Button>
        }
      />

      <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
        {data.alerts > 0 && (
          <motion.div variants={widget}>
            <Link href="/alerts"
                  className="group rim relative flex items-center gap-4 overflow-hidden rounded-[22px] bg-[linear-gradient(110deg,color-mix(in_oklch,var(--risk-critical),transparent_78%),color-mix(in_oklch,var(--risk-high),transparent_88%))] p-4 ring-1 ring-risk-critical/20 transition-transform duration-300 active:scale-[0.99]">
              <motion.div animate={{ rotate: [0, -12, 12, -8, 8, 0] }} transition={{ duration: 0.9, delay: 0.8, repeat: Infinity, repeatDelay: 5 }}
                          className="grid size-11 place-items-center rounded-full bg-gradient-to-b from-rose-400 to-red-600 text-white shadow-lg shadow-red-500/30">
                <BellRing className="size-5" />
              </motion.div>
              <div className="flex-1">
                <div className="font-semibold"><AnimatedNumber value={data.alerts} /> trường hợp cần chú ý</div>
                <div className="text-sm text-muted-foreground">Sinh viên xấu đi nhanh, nguy cơ cao chưa có kế hoạch, hoặc việc đã quá hạn.</div>
              </div>
              <span className="grid size-8 place-items-center rounded-full bg-background/50 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-0.5">
                <ArrowUpRight className="size-4" />
              </span>
            </Link>
          </motion.div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <motion.div variants={widget}>
            <Card className="h-full">
              <CardHeader className="pb-0">
                <CardDescription className="flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-[7px] bg-gradient-to-b from-sky-400 to-blue-600 text-white"><Users className="size-3.5" /></span>
                  Tổng sinh viên
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="font-heading text-4xl font-bold tracking-tight"><AnimatedNumber value={summary.total_students} /></div>
                <p className="mt-1 text-xs text-muted-foreground">{summary.not_predicted} chưa có dự đoán</p>
              </CardContent>
            </Card>
          </motion.div>
          {RISK_LEVELS.map((level) => {
            const share = summary.predicted ? summary.distribution[level] / summary.predicted : 0;
            return (
              <motion.div key={level} variants={widget} whileHover={{ y: -3 }} transition={SOFT_SPRING}>
                <Link href={`/students?risk=${encodeURIComponent(level)}`} className="block h-full">
                  <Card className="h-full">
                    <CardHeader className="pb-0">
                      <CardDescription className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full shadow-[0_0_8px_currentColor]" style={{ background: RISK_STYLE[level].color, color: RISK_STYLE[level].color }} />
                        Nguy cơ {level.toLowerCase()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-end justify-between gap-2">
                      <div>
                        <div className="font-heading text-4xl font-bold tracking-tight" style={{ color: RISK_STYLE[level].color }}>
                          <AnimatedNumber value={summary.distribution[level]} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{RISK_STYLE[level].hint}</p>
                      </div>
                      <Ring value={share} color={RISK_STYLE[level].color} />
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          <motion.div variants={widget} className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Phân bố mức nguy cơ</CardTitle>
                <CardDescription>Theo lần dự đoán gần nhất của mỗi sinh viên</CardDescription>
              </CardHeader>
              <CardContent>
                <RiskDonut distribution={summary.distribution} total={summary.predicted} />
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  {RISK_LEVELS.map((level) => (
                    <div key={level} className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
                      <span className="size-2.5 rounded-full" style={{ background: RISK_STYLE[level].color }} />
                      <span className="text-muted-foreground">{level}</span>
                      <span className="ml-auto font-semibold tabular-nums">{summary.distribution[level]}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={widget} className="lg:col-span-3">
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Lớp có nhiều sinh viên nguy cơ cao</CardTitle>
                <CardDescription>Mức Cao và Rất cao — nơi nên ưu tiên nguồn lực hỗ trợ</CardDescription>
              </CardHeader>
              <CardContent><ClassBar data={data.by_class} /></CardContent>
            </Card>
          </motion.div>

          <motion.div variants={widget} className="lg:col-span-5">
            <Card>
              <CardHeader>
                <CardTitle>Học lực, chuyên cần và nguy cơ</CardTitle>
                <CardDescription>Mỗi chấm là một sinh viên. Ranh giới giữa các mức cho thấy model đang dựa vào đâu.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <RiskScatter data={data.scatter} x="gpa" label="Điểm trung bình" />
                <RiskScatter data={data.scatter} x="attendance" label="Tỷ lệ chuyên cần (%)" />
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {data.model && (
          <motion.div variants={widget}
                      className="flex items-start gap-3 rounded-[18px] bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
            <Cpu className="mt-0.5 size-4 shrink-0" />
            <p>
              Model <b className="text-foreground">{data.model.name}</b> · recall {Math.round((data.model.metrics.recall ?? 0) * 100)}% ·
              huấn luyện {new Date(data.model.trained_at).toLocaleDateString("vi-VN")}. Recall là tỷ lệ sinh viên thực sự có
              nguy cơ được model phát hiện — phần còn lại có thể bị bỏ sót.
            </p>
          </motion.div>
        )}
      </motion.div>
    </>
  );
}

/** Vòng tỷ lệ nhỏ như widget Pin của macOS. */
function Ring({ value, color }: { value: number; color: string }) {
  const radius = 17;
  const length = 2 * Math.PI * radius;
  return (
    <div className="relative grid size-12 shrink-0 place-items-center">
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
        <circle cx="22" cy="22" r={radius} fill="none" stroke="var(--muted)" strokeWidth="5" />
        <motion.circle cx="22" cy="22" r={radius} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
                       strokeDasharray={length} initial={{ strokeDashoffset: length }}
                       animate={{ strokeDashoffset: length * (1 - value) }}
                       transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.3 }} />
      </svg>
      <span className="text-[10px] font-semibold tabular-nums">{Math.round(value * 100)}%</span>
    </div>
  );
}
