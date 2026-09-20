"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarClock, CheckCircle2, ChevronDown, CircleDashed, ClipboardList, ClipboardPlus, Cpu, Gauge, History, LineChart,
  LoaderCircle, Mail, MessageSquarePlus, MessagesSquare, MoreHorizontal, Pencil, Phone, Play, SlidersHorizontal, Table2,
  Trash2, TrendingDown, TrendingUp,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";

import { PageHeader, useUser } from "@/components/app-shell";
import { TrendChart } from "@/components/charts";
import { ConfirmDelete, InterventionDialog, MeetingDialog, MetricsDialog, StudentDialog } from "@/components/dialogs";
import { FactorList, Simulator, Suggestions } from "@/components/insight";
import { EmptyState, Monogram, Segmented, SOFT_SPRING } from "@/components/mac/controls";
import { RISK_STYLE, RiskBadge, RiskGauge } from "@/components/risk";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  api, formatDate, formatDateTime, STATUS_LABELS, useApi, type Features, type Intervention, type InterventionStatus,
  type Meeting, type MetricsRecord, type Prediction, type StudentDetail,
} from "@/lib/api";
import { cn } from "cn";

type Tab = "trend" | "simulate" | "plan" | "meetings" | "metrics" | "history";

const STATUS_META: Record<InterventionStatus, { label: string; icon: React.ElementType; tone: string }> = {
  not_started: { label: "Chưa bắt đầu", icon: CircleDashed, tone: "bg-muted text-muted-foreground" },
  in_progress: { label: "Đang xử lý", icon: LoaderCircle, tone: "bg-primary/12 text-primary" },
  completed: { label: "Đã xong", icon: CheckCircle2, tone: "bg-risk-low/14 text-risk-low" },
};

export default function StudentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useUser();
  const { mutate: mutateAll } = useSWRConfig();
  const { data, error } = useApi<StudentDetail>(`/students/${id}`);
  const [predicting, setPredicting] = useState(false);
  const [tab, setTab] = useState<Tab>("trend");
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Mọi thay đổi trong hồ sơ làm mới cả chi tiết lẫn các danh sách lịch sử của sinh viên này.
  const refresh = () => mutateAll((key) => typeof key === "string" && key.startsWith(`/students/${id}`));

  if (error) {
    return <EmptyState icon={Cpu} title="Không mở được hồ sơ" description={error.message} className="py-24" />;
  }
  if (!data) {
    return (
      <div className="space-y-6 pt-2">
        <div className="flex items-center gap-4"><Skeleton className="size-16 rounded-full" /><Skeleton className="h-10 w-80 rounded-full" /></div>
        <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-72 rounded-[22px]" /><Skeleton className="h-72 rounded-[22px] lg:col-span-2" /></div>
      </div>
    );
  }

  const { student, prediction } = data;

  async function predict() {
    setPredicting(true);
    try {
      const result = await api<Prediction>(`/students/${id}/predictions`, { method: "POST" });
      toast.success(`Kết quả: nguy cơ ${result.risk_level.toLowerCase()} (${Math.round(result.probability * 100)}%)`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPredicting(false);
    }
  }

  const delta = prediction && data.previous_probability != null
    ? Math.round((prediction.probability - data.previous_probability) * 100) : null;
  // Chỉ dự đoán được khi có đủ mười chỉ số; mô phỏng cũng cần đúng bộ đó làm điểm xuất phát.
  const canPredict = data.can_edit && data.features_complete;
  const openItems = data.interventions.filter((i) => i.status !== "completed").length;

  const tabs: { value: Tab; label: React.ReactNode; icon: React.ElementType }[] = [
    { value: "trend", label: "Diễn biến", icon: LineChart },
    ...(canPredict ? [{ value: "simulate" as Tab, label: "Mô phỏng", icon: SlidersHorizontal }] : []),
    { value: "plan", label: <>Kế hoạch{openItems > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{openItems}</span>}</>, icon: ClipboardList },
    { value: "meetings", label: "Gặp mặt", icon: MessagesSquare },
    { value: "metrics", label: "Chỉ số", icon: Table2 },
    { value: "history", label: "Dự đoán", icon: History },
  ];

  return (
    <>
      <PageHeader
        icon={<motion.div initial={{ scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 16 }}>
          <Monogram name={student.full_name} className="size-16 text-2xl" />
        </motion.div>}
        title={student.full_name}
        description={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="font-medium text-foreground/80">{student.student_code}</span>
            {student.class_name && <span>· {student.class_name}</span>}
            {student.major && <span>· {student.major}</span>}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{STATUS_LABELS[student.status]}</span>
            {data.advisor && <span>· Phụ trách: {data.advisor}</span>}
          </span>
        }
        actions={data.can_edit && (
          <>
            <MetricsDialog studentId={student.student_id} initial={data.features} onSaved={refresh}
                           trigger={<Button variant="outline"><ClipboardPlus /> Nhập chỉ số</Button>} />
            <Button onClick={predict} disabled={!canPredict || predicting}
                    title={canPredict ? undefined : "Cần nhập đủ chỉ số trước khi dự đoán"}>
              {predicting ? <LoaderCircle className="animate-spin" /> : <Play />} Chạy dự đoán
            </Button>
            {data.is_admin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Thao tác khác"><MoreHorizontal /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setEditing(true)}><Pencil />Sửa hồ sơ…</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}><Trash2 />Xoá sinh viên…</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        )}
      />

      {(student.email || student.phone) && (
        <div className="-mt-3 mb-5 flex flex-wrap gap-2 text-sm">
          {student.email && <a href={`mailto:${student.email}`} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 hover:bg-muted/70"><Mail className="size-3.5" />{student.email}</a>}
          {student.phone && <a href={`tel:${student.phone}`} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 hover:bg-muted/70"><Phone className="size-3.5" />{student.phone}</a>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={SOFT_SPRING}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Gauge className="size-4 text-primary" /> Mức nguy cơ</CardTitle>
              {prediction && <CardDescription>Dự đoán ngày {formatDate(prediction.created_at)}</CardDescription>}
            </CardHeader>
            <CardContent className="text-center">
              {prediction ? (
                <>
                  <RiskGauge probability={prediction.probability} level={prediction.risk_level} />
                  <div className="mt-3"><RiskBadge level={prediction.risk_level} className="text-sm" /></div>
                  <p className="mt-2 text-sm text-muted-foreground">{RISK_STYLE[prediction.risk_level].hint}</p>
                  {delta != null && delta !== 0 && (
                    <motion.p initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6, ...SOFT_SPRING }}
                              className={cn("mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium",
                                delta > 0 ? "bg-risk-critical/12 text-risk-critical" : "bg-risk-low/12 text-risk-low")}>
                      {delta > 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                      {delta > 0 ? "+" : ""}{delta} điểm so với lần trước
                    </motion.p>
                  )}
                </>
              ) : (
                <EmptyState icon={Cpu} title={data.features_complete ? "Chưa chạy dự đoán" : "Chưa đủ chỉ số"}
                            description={data.features_complete ? "Bấm Chạy dự đoán để có kết quả." : "Nhập đủ mười chỉ số để dự đoán."} />
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT_SPRING, delay: 0.06 }} className="lg:col-span-2">
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
        </motion.div>
      </div>

      {data.can_edit && prediction && (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT_SPRING, delay: 0.12 }} className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Nên làm gì tiếp</CardTitle>
              <CardDescription>Gợi ý suy ra từ các yếu tố đang làm tăng nguy cơ</CardDescription>
            </CardHeader>
            <CardContent><Suggestions items={data.suggestions} studentId={student.student_id} onAdded={refresh} /></CardContent>
          </Card>
        </motion.div>
      )}

      <div className="mt-8 mb-4 overflow-x-auto pb-1">
        <Segmented value={tab} onChange={setTab} options={tabs} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 10, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -6, filter: "blur(3px)" }} transition={{ duration: 0.22 }}>
          {tab === "trend" && (
            <Card>
              <CardHeader>
                <CardTitle>Diễn biến qua các học kỳ</CardTitle>
                <CardDescription>Đường nét đứt ở 60% là ngưỡng bắt đầu mức nguy cơ cao</CardDescription>
              </CardHeader>
              <CardContent><TrendChart data={data.trend} /></CardContent>
            </Card>
          )}
          {tab === "simulate" && canPredict && (
            <Card>
              <CardHeader>
                <CardTitle>Nếu… thì sao?</CardTitle>
                <CardDescription>Kéo các chỉ số để xem nguy cơ thay đổi thế nào — chọn can thiệp vào chỗ có tác dụng nhất. Không lưu gì.</CardDescription>
              </CardHeader>
              <CardContent><Simulator base={data.features as unknown as Features} /></CardContent>
            </Card>
          )}
          {tab === "plan" && <PlanTab data={data} onChanged={refresh} />}
          {tab === "meetings" && <MeetingsTab data={data} onChanged={refresh} />}
          {tab === "metrics" && <MetricsTab id={id} canEdit={data.can_edit} onChanged={refresh} />}
          {tab === "history" && <HistoryTab id={id} canEdit={data.can_edit} onChanged={refresh} />}
        </motion.div>
      </AnimatePresence>

      {user.role === "student" && (
        <p className="mt-6 text-xs text-muted-foreground">
          Kết quả này giúp cố vấn học tập biết khi nào nên hỗ trợ bạn. Nó không ảnh hưởng tới điểm số hay kết quả học tập.
        </p>
      )}

      {data.is_admin && (
        <>
          <StudentDialog student={student} open={editing} onOpenChange={setEditing} onSaved={refresh} />
          <ConfirmDelete
            open={deleting} onOpenChange={setDeleting}
            title={`Xoá vĩnh viễn ${student.student_code}?`}
            description="Toàn bộ điểm số, chuyên cần, lịch sử dự đoán, biên bản gặp mặt và kế hoạch can thiệp của sinh viên này sẽ bị xoá theo. Không khôi phục được."
            confirmLabel="Xoá sinh viên"
            onConfirm={async () => {
              await api(`/students/${id}`, { method: "DELETE" });
              toast.success(`Đã xoá ${student.student_code}`);
              router.push("/students");
            }}
          />
        </>
      )}
    </>
  );
}

// ===== Kế hoạch can thiệp =====

function PlanTab({ data, onChanged }: { data: StudentDetail; onChanged: () => void }) {
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [editing, setEditing] = useState<Intervention | null>(null);
  const [deleting, setDeleting] = useState<Intervention | null>(null);
  const items = filter === "open" ? data.interventions.filter((i) => i.status !== "completed") : data.interventions;

  async function setStatus(item: Intervention, status: InterventionStatus) {
    try {
      await api(`/interventions/${item.intervention_id}`, { method: "PATCH", json: { status } });
      if (status === "completed") toast.success("Đã hoàn thành", { description: item.title });
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kế hoạch can thiệp</CardTitle>
        <CardDescription>Việc đang xử lý lên đầu, rồi theo hạn gần nhất</CardDescription>
        <CardAction className="flex items-center gap-2">
          <Segmented size="sm" value={filter} onChange={setFilter}
                     options={[{ value: "open", label: "Đang mở" }, { value: "all", label: "Tất cả" }]} />
          {data.can_edit && (
            <InterventionDialog studentId={data.student.student_id} onSaved={onChanged}
                                trigger={<Button size="sm"><ClipboardPlus /> Thêm việc</Button>} />
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2">
        <AnimatePresence initial={false}>
          {items.map((item) => {
            const meta = STATUS_META[item.status];
            return (
              <motion.div key={item.intervention_id} layout
                          initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95, height: 0, marginBottom: 0 }}
                          transition={SOFT_SPRING}
                          className={cn("group flex flex-wrap items-start gap-3 rounded-2xl bg-muted/40 p-3.5 ring-1 ring-transparent transition-colors hover:bg-muted/70",
                            item.is_overdue && "bg-risk-critical/6 ring-risk-critical/25")}>
                {data.can_edit ? (
                  <motion.button type="button" whileTap={{ scale: 0.8 }} aria-label="Đánh dấu hoàn thành"
                                 onClick={() => setStatus(item, item.status === "completed" ? "in_progress" : "completed")}
                                 className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ring-2 transition-colors",
                                   item.status === "completed" ? "bg-risk-low text-white ring-risk-low" : "ring-muted-foreground/40 hover:ring-primary")}>
                    {item.status === "completed" && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}><CheckCircle2 className="size-5" /></motion.span>}
                  </motion.button>
                ) : <meta.icon className="mt-0.5 size-5 text-muted-foreground" />}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("font-medium transition-colors", item.status === "completed" && "text-muted-foreground line-through")}>{item.title}</span>
                    <span className="rounded-full bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground">{item.category_label}</span>
                  </div>
                  {item.description && <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {item.due_date && (
                      <span className={cn("inline-flex items-center gap-1", item.is_overdue && "font-semibold text-risk-critical")}>
                        <CalendarClock className="size-3.5" /> Hạn {formatDate(item.due_date)}{item.is_overdue && " — quá hạn"}
                      </span>
                    )}
                    {item.counselor && <span>Phụ trách: {item.counselor}</span>}
                    {item.completed_at && <span>Xong lúc {formatDateTime(item.completed_at)}</span>}
                  </div>
                </div>

                {data.can_edit ? (
                  <div className="flex items-center gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className={cn("inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium", meta.tone)}>
                          <meta.icon className={cn("size-3.5", item.status === "in_progress" && "animate-spin [animation-duration:3s]")} />
                          {meta.label}<ChevronDown className="size-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        {(Object.keys(STATUS_META) as InterventionStatus[]).map((s) => {
                          const Icon = STATUS_META[s].icon;
                          return <DropdownMenuItem key={s} onClick={() => setStatus(item, s)}><Icon />{STATUS_META[s].label}</DropdownMenuItem>;
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <RowActions onEdit={() => setEditing(item)} onDelete={() => setDeleting(item)} />
                  </div>
                ) : (
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", meta.tone)}>{meta.label}</span>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {!items.length && (
          <EmptyState icon={ClipboardList} title={filter === "open" ? "Không có việc nào đang mở" : "Chưa có việc nào trong kế hoạch"}
                      description={data.can_edit ? "Thêm việc thủ công hoặc chọn từ gợi ý phía trên." : undefined} />
        )}
      </CardContent>

      {editing && (
        <InterventionDialog key={editing.intervention_id} studentId={data.student.student_id} item={editing}
                            open onOpenChange={(open) => !open && setEditing(null)} onSaved={onChanged} />
      )}
      <ConfirmDelete open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}
                     title="Xoá việc can thiệp này?" description={deleting?.title}
                     onConfirm={async () => {
                       await api(`/interventions/${deleting!.intervention_id}`, { method: "DELETE" });
                       toast.success("Đã xoá việc can thiệp");
                       onChanged();
                     }} />
    </Card>
  );
}

// ===== Gặp mặt =====

function MeetingsTab({ data, onChanged }: { data: StudentDetail; onChanged: () => void }) {
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [deleting, setDeleting] = useState<Meeting | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Biên bản gặp mặt</CardTitle>
        <CardDescription>{data.meetings.length} buổi gặp, mới nhất lên đầu</CardDescription>
        {data.can_edit && (
          <CardAction>
            <MeetingDialog studentId={data.student.student_id} onSaved={onChanged}
                           trigger={<Button size="sm"><MessageSquarePlus /> Ghi biên bản</Button>} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-3 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-border">
          <AnimatePresence initial={false}>
            {data.meetings.map((m, i) => (
              <motion.li key={m.meeting_id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                         exit={{ opacity: 0, height: 0 }} transition={{ ...SOFT_SPRING, delay: i * 0.03 }}
                         className="group relative flex gap-4">
                <span className="relative z-10 mt-2 grid size-[31px] shrink-0 place-items-center rounded-full bg-gradient-to-b from-sky-400 to-blue-600 text-white shadow-[0_0_0_4px_var(--glass-strong)]">
                  <MessagesSquare className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1 rounded-2xl bg-muted/40 p-3.5 transition-colors hover:bg-muted/70">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{m.type_label}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(m.meeting_date)} · {m.duration_minutes} phút{m.counselor && ` · ${m.counselor}`}
                      </div>
                    </div>
                    {data.can_edit && <RowActions onEdit={() => setEditing(m)} onDelete={() => setDeleting(m)} />}
                  </div>
                  {m.notes && <p className="mt-2 text-sm whitespace-pre-line text-foreground/80">{m.notes}</p>}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
        {!data.meetings.length && <EmptyState icon={MessagesSquare} title="Chưa có buổi gặp nào" />}
      </CardContent>

      {editing && (
        <MeetingDialog key={editing.meeting_id} studentId={data.student.student_id} meeting={editing}
                       open onOpenChange={(open) => !open && setEditing(null)} onSaved={onChanged} />
      )}
      <ConfirmDelete open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}
                     title="Xoá biên bản gặp mặt?"
                     description={deleting && `${deleting.type_label} ngày ${formatDate(deleting.meeting_date)}. Việc can thiệp phát sinh từ buổi gặp này được giữ lại.`}
                     onConfirm={async () => {
                       await api(`/meetings/${deleting!.meeting_id}`, { method: "DELETE" });
                       toast.success("Đã xoá biên bản");
                       onChanged();
                     }} />
    </Card>
  );
}

// ===== Lịch sử chỉ số =====

function MetricsTab({ id, canEdit, onChanged }: { id: string; canEdit: boolean; onChanged: () => void }) {
  const { data } = useApi<MetricsRecord[]>(`/students/${id}/metrics`);
  const [editing, setEditing] = useState<MetricsRecord | null>(null);
  const [deleting, setDeleting] = useState<MetricsRecord | null>(null);

  return (
    <Card className="gap-0 overflow-hidden pb-0">
      <CardHeader className="pb-4">
        <CardTitle>Lịch sử chỉ số</CardTitle>
        <CardDescription>Mỗi lần nhập là một bản ghi riêng — sửa khi nhập nhầm, xoá khi trùng lặp</CardDescription>
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Học kỳ</TableHead>
              <TableHead className="text-right">GPA</TableHead>
              <TableHead className="text-right">Môn trượt</TableHead>
              <TableHead className="text-right">Tín chỉ</TableHead>
              <TableHead className="text-right">Chuyên cần</TableHead>
              <TableHead className="text-right">Đăng nhập</TableHead>
              <TableHead className="text-right">Bài thiếu</TableHead>
              <TableHead className="text-right">Giờ học</TableHead>
              <TableHead>Ghi nhận</TableHead>
              {canEdit && <TableHead className="w-20 pr-5" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data && <TableRow><TableCell colSpan={10} className="px-5"><Skeleton className="h-24 rounded-xl" /></TableCell></TableRow>}
            <AnimatePresence initial={false}>
              {data?.map((r, i) => (
                <motion.tr key={r.result_id} data-slot="table-row" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                           className="group border-b border-border/60 transition-colors last:border-0 hover:bg-muted/60">
                  <TableCell className="pl-5 font-medium">
                    {r.semester}{i === 0 && <span className="ml-2 rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Mới nhất</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.gpa?.toFixed(2) ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.failed_subjects ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.credits_completed ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.attendance_rate != null ? `${Math.round(r.attendance_rate)}%` : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.login_count ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.assignment_missing ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.learning_hours ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(r.recorded_at)}</TableCell>
                  {canEdit && (
                    <TableCell className="pr-5">
                      <RowActions onEdit={() => setEditing(r)} onDelete={() => setDeleting(r)} />
                    </TableCell>
                  )}
                </motion.tr>
              ))}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>
      {data && !data.length && <EmptyState icon={Table2} title="Chưa có chỉ số nào" />}

      {editing && (
        <MetricsDialog key={editing.result_id} studentId={Number(id)} record={editing}
                       open onOpenChange={(open) => !open && setEditing(null)} onSaved={onChanged} />
      )}
      <ConfirmDelete open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}
                     title={`Xoá chỉ số học kỳ ${deleting?.semester ?? ""}?`}
                     description="Kết quả học tập, chuyên cần và tương tác của lần ghi nhận này sẽ bị xoá. Các lần dự đoán đã chạy vẫn được giữ."
                     onConfirm={async () => {
                       await api(`/students/${id}/metrics/${deleting!.result_id}`, { method: "DELETE" });
                       toast.success("Đã xoá bản ghi chỉ số");
                       onChanged();
                     }} />
    </Card>
  );
}

// ===== Lịch sử dự đoán =====

function HistoryTab({ id, canEdit, onChanged }: { id: string; canEdit: boolean; onChanged: () => void }) {
  const { data } = useApi<Prediction[]>(`/students/${id}/predictions`);
  const [open, setOpen] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Prediction | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lịch sử dự đoán</CardTitle>
        <CardDescription>Mỗi lần chạy lưu kèm giải thích của đúng phiên bản model lúc đó. Bấm để xem yếu tố.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {!data && <Skeleton className="h-32 rounded-2xl" />}
        <AnimatePresence initial={false}>
          {data?.map((p) => (
            <motion.div key={p.prediction_id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }}
                        className="group overflow-hidden rounded-2xl bg-muted/40">
              <div className="flex items-center gap-3 px-3.5 py-2.5">
                <button type="button" onClick={() => setOpen(open === p.prediction_id ? null : p.prediction_id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <motion.span animate={{ rotate: open === p.prediction_id ? 180 : 0 }}><ChevronDown className="size-4 text-muted-foreground" /></motion.span>
                  <span className="w-32 text-sm tabular-nums">{formatDateTime(p.created_at)}</span>
                  <RiskBadge level={p.risk_level} probability={p.probability} />
                  <span className="hidden truncate text-sm text-muted-foreground md:inline">{p.shap_top_factors?.[0]?.label ?? "—"}</span>
                  <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">{p.model_version}</span>
                </button>
                {canEdit && (
                  <button type="button" aria-label="Xoá lần dự đoán" onClick={() => setDeleting(p)}
                          className="grid size-7 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              <AnimatePresence initial={false}>
                {open === p.prediction_id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                              transition={SOFT_SPRING} className="overflow-hidden">
                    <div className="border-t border-border/60 px-4 py-3">
                      {p.shap_top_factors?.length ? <FactorList factors={p.shap_top_factors} /> : <p className="text-sm text-muted-foreground">Không có giải thích.</p>}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
        {data && !data.length && <EmptyState icon={History} title="Chưa có lần dự đoán nào" />}
      </CardContent>

      <ConfirmDelete open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}
                     title="Xoá lần dự đoán này?"
                     description={deleting && `Kết quả ${deleting.risk_level.toLowerCase()} (${Math.round(deleting.probability * 100)}%) lúc ${formatDateTime(deleting.created_at)}. Việc can thiệp đã tạo từ lần dự đoán này được giữ lại.`}
                     onConfirm={async () => {
                       await api(`/predictions/${deleting!.prediction_id}`, { method: "DELETE" });
                       toast.success("Đã xoá lần dự đoán");
                       onChanged();
                     }} />
    </Card>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <span className="flex items-center gap-0.5 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
      <button type="button" aria-label="Sửa" onClick={onEdit}
              className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-background/70 hover:text-foreground">
        <Pencil className="size-3.5" />
      </button>
      <button type="button" aria-label="Xoá" onClick={onDelete}
              className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
        <Trash2 className="size-3.5" />
      </button>
    </span>
  );
}
