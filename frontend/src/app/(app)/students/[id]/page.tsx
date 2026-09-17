"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarClock, CheckCircle2, ClipboardPlus, Cpu, Gauge, History, MessageSquarePlus, Pencil, Play, Trash2, TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader, useUser } from "@/components/app-shell";
import { TrendChart } from "@/components/charts";
import { InterventionDialog, MeetingDialog, MetricsDialog, StudentDialog } from "@/components/dialogs";
import { FactorList, Simulator, Suggestions } from "@/components/insight";
import { FadeIn } from "@/components/motion";
import { RISK_STYLE, RiskBadge, RiskGauge } from "@/components/risk";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  api, formatDate, STATUS_LABELS, useApi, type Features, type Intervention, type InterventionStatus, type Prediction,
  type StudentDetail,
} from "@/lib/api";
import { cn } from "cn";

const NEXT_STATUS: Partial<Record<InterventionStatus, { to: InterventionStatus; label: string }>> = {
  not_started: { to: "in_progress", label: "Bắt đầu" },
  in_progress: { to: "completed", label: "Hoàn thành" },
};

export default function StudentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useUser();
  const { data, error, mutate } = useApi<StudentDetail>(`/students/${id}`);
  const { data: history } = useApi<Prediction[]>(`/students/${id}/predictions`);
  const [predicting, setPredicting] = useState(false);

  if (error) {
    return <p className="py-20 text-center text-muted-foreground">{error.message}</p>;
  }
  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80" />
        <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-72" /><Skeleton className="h-72 lg:col-span-2" /></div>
      </div>
    );
  }

  const { student, prediction } = data;
  const refresh = () => mutate();

  async function predict() {
    setPredicting(true);
    try {
      const result = await api<Prediction>(`/students/${id}/predictions`, { method: "POST" });
      toast.success(`Kết quả: nguy cơ ${result.risk_level.toLowerCase()} (${Math.round(result.probability * 100)}%)`);
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPredicting(false);
    }
  }

  async function remove() {
    await api(`/students/${id}`, { method: "DELETE" });
    toast.success(`Đã xoá ${student.student_code}`);
    router.push("/students");
  }

  async function setStatus(item: Intervention, status: InterventionStatus) {
    try {
      await api(`/interventions/${item.intervention_id}`, { method: "PATCH", json: { status } });
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const delta = prediction && data.previous_probability != null
    ? Math.round((prediction.probability - data.previous_probability) * 100) : null;
  // Chỉ dự đoán được khi có đủ mười chỉ số; mô phỏng cũng cần đúng bộ đó làm điểm xuất phát.
  const canPredict = data.can_edit && data.features_complete;
  const openItems = data.interventions.filter((i) => i.status !== "completed").length;

  return (
    <>
      <PageHeader
        title={student.full_name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{student.student_code}</span>
            {student.class_name && <span>· {student.class_name}</span>}
            {student.major && <span>· {student.major}</span>}
            <Badge variant="secondary">{STATUS_LABELS[student.status]}</Badge>
            {data.advisor && <span>· Phụ trách: {data.advisor}</span>}
          </span>
        }
        actions={data.can_edit && (
          <>
            <MetricsDialog studentId={student.student_id} initial={data.features} onSaved={refresh}
                           trigger={<Button variant="outline"><ClipboardPlus /> Nhập chỉ số</Button>} />
            <Button onClick={predict} disabled={!canPredict || predicting}
                    title={canPredict ? undefined : "Cần nhập đủ chỉ số trước khi dự đoán"}>
              <Play className={cn(predicting && "animate-pulse")} /> Chạy dự đoán
            </Button>
            {data.is_admin && (
              <>
                <StudentDialog student={student} onSaved={refresh}
                               trigger={<Button variant="ghost" size="icon" aria-label="Sửa hồ sơ"><Pencil /></Button>} />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Xoá sinh viên"><Trash2 className="text-destructive" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Xoá vĩnh viễn {student.student_code}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Toàn bộ điểm số, chuyên cần, lịch sử dự đoán, biên bản gặp mặt và kế hoạch can thiệp của
                        sinh viên này sẽ bị xoá theo. Không khôi phục được.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Huỷ</AlertDialogCancel>
                      <AlertDialogAction onClick={remove} className="bg-destructive text-white hover:bg-destructive/90">
                        Xoá sinh viên
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </>
        )}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <FadeIn>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Gauge className="size-4" /> Mức nguy cơ</CardTitle>
              {prediction && <CardDescription>Dự đoán ngày {formatDate(prediction.created_at)}</CardDescription>}
            </CardHeader>
            <CardContent className="text-center">
              {prediction ? (
                <>
                  <RiskGauge probability={prediction.probability} level={prediction.risk_level} />
                  <div className="mt-3"><RiskBadge level={prediction.risk_level} className="text-sm" /></div>
                  <p className="mt-2 text-sm text-muted-foreground">{RISK_STYLE[prediction.risk_level].hint}</p>
                  {delta != null && delta !== 0 && (
                    <p className={cn("mt-3 inline-flex items-center gap-1 text-sm font-medium",
                      delta > 0 ? "text-risk-critical" : "text-risk-low")}>
                      {delta > 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                      {delta > 0 ? "+" : ""}{delta} điểm so với lần trước
                    </p>
                  )}
                </>
              ) : (
                <div className="py-10 text-sm text-muted-foreground">
                  <Cpu className="mx-auto mb-3 size-8 opacity-40" />
                  {data.features_complete ? "Chưa chạy dự đoán cho sinh viên này." : "Chưa đủ chỉ số để dự đoán."}
                </div>
              )}
            </CardContent>
          </Card>
        </FadeIn>

        <FadeIn delay={0.08} className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Vì sao có kết quả này</CardTitle>
              <CardDescription>Những yếu tố ảnh hưởng mạnh nhất tới dự đoán gần nhất</CardDescription>
            </CardHeader>
            <CardContent>
              {prediction?.shap_top_factors?.length
                ? <FactorList factors={prediction.shap_top_factors} />
                : <p className="text-sm text-muted-foreground">Chưa có giải thích.</p>}
            </CardContent>
          </Card>
        </FadeIn>
      </div>

      {data.can_edit && prediction && (
        <FadeIn delay={0.14} className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Nên làm gì tiếp</CardTitle>
              <CardDescription>Gợi ý suy ra từ các yếu tố đang làm tăng nguy cơ</CardDescription>
            </CardHeader>
            <CardContent>
              <Suggestions items={data.suggestions} studentId={student.student_id} onAdded={refresh} />
            </CardContent>
          </Card>
        </FadeIn>
      )}

      <Tabs defaultValue="trend" className="mt-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="trend">Diễn biến</TabsTrigger>
          {canPredict && <TabsTrigger value="simulate">Mô phỏng</TabsTrigger>}
          <TabsTrigger value="plan">Kế hoạch can thiệp {openItems > 0 && <Badge variant="secondary" className="ml-1.5">{openItems}</Badge>}</TabsTrigger>
          <TabsTrigger value="meetings">Gặp mặt</TabsTrigger>
          <TabsTrigger value="history">Lịch sử dự đoán</TabsTrigger>
        </TabsList>

        <TabsContent value="trend">
          <Card>
            <CardHeader>
              <CardTitle>Diễn biến qua các học kỳ</CardTitle>
              <CardDescription>Đường nét đứt ở 60% là ngưỡng bắt đầu mức nguy cơ cao</CardDescription>
            </CardHeader>
            <CardContent><TrendChart data={data.trend} /></CardContent>
          </Card>
        </TabsContent>

        {canPredict && (
          <TabsContent value="simulate">
            <Card>
              <CardHeader>
                <CardTitle>Nếu… thì sao?</CardTitle>
                <CardDescription>
                  Kéo các chỉ số để xem nguy cơ thay đổi thế nào — chọn can thiệp vào chỗ có tác dụng nhất. Không lưu gì.
                </CardDescription>
              </CardHeader>
              <CardContent><Simulator base={data.features as unknown as Features} /></CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="plan">
          <Card>
            <CardHeader>
              <CardTitle>Kế hoạch can thiệp</CardTitle>
              <CardDescription>Việc đang xử lý lên đầu, rồi theo hạn gần nhất</CardDescription>
              {data.can_edit && (
                <CardAction>
                  <InterventionDialog studentId={student.student_id} onSaved={refresh}
                                      trigger={<Button size="sm"><ClipboardPlus /> Thêm việc</Button>} />
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="space-y-2.5">
              <AnimatePresence initial={false}>
                {data.interventions.map((item) => (
                  <motion.div key={item.intervention_id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                              className={cn("flex flex-wrap items-start gap-3 rounded-lg border p-3",
                                item.status === "completed" && "opacity-60", item.is_overdue && "border-risk-critical/40 bg-risk-critical/5")}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("font-medium", item.status === "completed" && "line-through")}>{item.title}</span>
                        <Badge variant="outline" className="text-[11px]">{item.category_label}</Badge>
                      </div>
                      {item.description && <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>}
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {item.due_date && (
                          <span className={cn("inline-flex items-center gap-1", item.is_overdue && "font-medium text-risk-critical")}>
                            <CalendarClock className="size-3.5" /> Hạn {formatDate(item.due_date)}{item.is_overdue && " — quá hạn"}
                          </span>
                        )}
                        {item.counselor && <span>Phụ trách: {item.counselor}</span>}
                      </div>
                    </div>
                    {item.status === "completed" ? (
                      <span className="inline-flex items-center gap-1 text-sm text-risk-low"><CheckCircle2 className="size-4" /> Đã xong</span>
                    ) : data.can_edit && NEXT_STATUS[item.status] ? (
                      <Button size="sm" variant="outline" onClick={() => setStatus(item, NEXT_STATUS[item.status]!.to)}>
                        {NEXT_STATUS[item.status]!.label}
                      </Button>
                    ) : (
                      <Badge variant="secondary">{item.status === "in_progress" ? "Đang xử lý" : "Chưa bắt đầu"}</Badge>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              {!data.interventions.length && <p className="py-6 text-center text-sm text-muted-foreground">Chưa có việc nào trong kế hoạch.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="meetings">
          <Card>
            <CardHeader>
              <CardTitle>Biên bản gặp mặt</CardTitle>
              {data.can_edit && (
                <CardAction>
                  <MeetingDialog studentId={student.student_id} onSaved={refresh}
                                 trigger={<Button size="sm"><MessageSquarePlus /> Ghi biên bản</Button>} />
                </CardAction>
              )}
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-5 border-l pl-6">
                {data.meetings.map((m) => (
                  <li key={m.meeting_id} className="relative">
                    <span className="absolute -left-[31px] top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-background" />
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{m.type_label}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(m.meeting_date)} · {m.duration_minutes} phút{m.counselor && ` · ${m.counselor}`}</span>
                    </div>
                    {m.notes && <p className="mt-1 text-sm text-muted-foreground">{m.notes}</p>}
                  </li>
                ))}
              </ol>
              {!data.meetings.length && <p className="py-6 text-center text-sm text-muted-foreground">Chưa có buổi gặp nào.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="pl-4"><History className="inline size-4" /> Thời điểm</TableHead>
                  <TableHead>Mức nguy cơ</TableHead>
                  <TableHead>Yếu tố chính</TableHead>
                  <TableHead className="pr-4">Phiên bản model</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history?.map((p) => (
                  <TableRow key={p.prediction_id}>
                    <TableCell className="pl-4 tabular-nums">{new Date(p.created_at).toLocaleString("vi-VN")}</TableCell>
                    <TableCell><RiskBadge level={p.risk_level} probability={p.probability} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.shap_top_factors?.[0]?.label ?? "—"}</TableCell>
                    <TableCell className="pr-4 text-xs text-muted-foreground">{p.model_version}</TableCell>
                  </TableRow>
                ))}
                {history && !history.length && (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Chưa có lần dự đoán nào.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {user.role === "student" && (
        <p className="mt-6 text-xs text-muted-foreground">
          Kết quả này giúp cố vấn học tập biết khi nào nên hỗ trợ bạn. Nó không ảnh hưởng tới điểm số hay kết quả học tập.
        </p>
      )}
    </>
  );
}
