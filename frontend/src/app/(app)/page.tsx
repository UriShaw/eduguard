"use client";

import { ArrowRight, BellRing, RefreshCw, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader, useUser } from "@/components/app-shell";
import { ClassBar, RiskDonut, RiskScatter } from "@/components/charts";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion";
import { RISK_STYLE } from "@/components/risk";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, RISK_LEVELS, useApi, type Dashboard } from "@/lib/api";

export default function DashboardPage() {
  const user = useUser();
  const router = useRouter();
  const { data, mutate } = useApi<Dashboard>(user.role === "student" ? null : "/dashboard");
  const [running, setRunning] = useState(false);

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
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const { summary } = data;

  return (
    <>
      <PageHeader
        title={`Xin chào, ${user.full_name}`}
        description={user.role === "admin" ? "Tình hình nguy cơ bỏ học toàn trường" : "Tình hình sinh viên bạn phụ trách"}
        actions={
          <Button variant="outline" onClick={runBatch} disabled={running}>
            <RefreshCw className={running ? "animate-spin" : ""} /> Cập nhật dự đoán
          </Button>
        }
      />

      {data.alerts > 0 && (
        <FadeIn>
          <Link href="/alerts"
                className="group mb-6 flex items-center gap-4 rounded-xl border border-risk-critical/25 bg-risk-critical/5 p-4 transition-colors hover:bg-risk-critical/10">
            <div className="grid size-10 place-items-center rounded-full bg-risk-critical text-white">
              <BellRing className="size-5" />
            </div>
            <div className="flex-1">
              <div className="font-medium">{data.alerts} trường hợp cần chú ý</div>
              <div className="text-sm text-muted-foreground">Sinh viên xấu đi nhanh, nguy cơ cao chưa có kế hoạch, hoặc việc đã quá hạn.</div>
            </div>
            <ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </Link>
        </FadeIn>
      )}

      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StaggerItem>
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2"><Users className="size-4" /> Tổng sinh viên</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tabular-nums">{summary.total_students}</div>
              <p className="text-xs text-muted-foreground">{summary.not_predicted} chưa có dự đoán</p>
            </CardContent>
          </Card>
        </StaggerItem>
        {RISK_LEVELS.map((level) => (
          <StaggerItem key={level}>
            <Link href={`/students?risk=${encodeURIComponent(level)}`}>
              <Card className="h-full border-l-4 transition-shadow hover:shadow-md" style={{ borderLeftColor: RISK_STYLE[level].color }}>
                <CardHeader className="pb-2"><CardDescription>Nguy cơ {level.toLowerCase()}</CardDescription></CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tabular-nums" style={{ color: RISK_STYLE[level].color }}>
                    {summary.distribution[level]}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {summary.predicted ? Math.round((summary.distribution[level] / summary.predicted) * 100) : 0}% · {RISK_STYLE[level].hint}
                  </p>
                </CardContent>
              </Card>
            </Link>
          </StaggerItem>
        ))}
      </Stagger>

      <FadeIn delay={0.15} className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Phân bố mức nguy cơ</CardTitle>
            <CardDescription>Theo lần dự đoán gần nhất của mỗi sinh viên</CardDescription>
          </CardHeader>
          <CardContent>
            <RiskDonut distribution={summary.distribution} total={summary.predicted} />
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              {RISK_LEVELS.map((level) => (
                <div key={level} className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: RISK_STYLE[level].color }} />
                  <span className="text-muted-foreground">{level}</span>
                  <span className="ml-auto font-medium tabular-nums">{summary.distribution[level]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Lớp có nhiều sinh viên nguy cơ cao</CardTitle>
            <CardDescription>Mức Cao và Rất cao — nơi nên ưu tiên nguồn lực hỗ trợ</CardDescription>
          </CardHeader>
          <CardContent><ClassBar data={data.by_class} /></CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Học lực, chuyên cần và nguy cơ</CardTitle>
            <CardDescription>Mỗi chấm là một sinh viên. Đường ranh giới giữa các mức cho thấy model đang dựa vào đâu.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <RiskScatter data={data.scatter} x="gpa" label="Điểm trung bình" />
            <RiskScatter data={data.scatter} x="attendance" label="Tỷ lệ chuyên cần (%)" />
          </CardContent>
        </Card>
      </FadeIn>

      {data.model && (
        <p className="mt-6 text-xs text-muted-foreground">
          Model {data.model.name} · recall {Math.round((data.model.metrics.recall ?? 0) * 100)}% · huấn luyện{" "}
          {new Date(data.model.trained_at).toLocaleDateString("vi-VN")}. Recall là tỷ lệ sinh viên thực sự có nguy cơ
          được model phát hiện — phần còn lại có thể bị bỏ sót.
        </p>
      )}
    </>
  );
}
