"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft, ChevronRight, Eye, FolderOpen, GraduationCap, Pencil, Plus, SearchX, Trash2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader, useUser } from "@/components/app-shell";
import { ConfirmDelete, StudentDialog } from "@/components/dialogs";
import { EmptyState, Kbd, Monogram, SearchField, Segmented, SOFT_SPRING } from "@/components/mac/controls";
import { RISK_STYLE, RiskBadge, RiskGauge } from "@/components/risk";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  api, RISK_LEVELS, STATUS_LABELS, useApi, type Options, type Page, type RiskLevel, type StudentDetail, type StudentRow,
} from "@/lib/api";
import { cn } from "cn";

const ALL = "all";

function StudentList() {
  const user = useUser();
  const router = useRouter();
  const params = useSearchParams();
  const isAdmin = user.role === "admin";

  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  const [risk, setRisk] = useState(params.get("risk") ?? "");
  const [className, setClassName] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState(-1);
  const [quickLook, setQuickLook] = useState<StudentRow | null>(null);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [deleting, setDeleting] = useState<StudentRow | null>(null);
  const [creating, setCreating] = useState(params.get("new") === "1");

  // Chờ người dùng ngừng gõ rồi mới tìm, tránh gọi API ở mỗi phím bấm.
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(keyword); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  const query = new URLSearchParams({
    keyword: search, risk, page: String(page), per_page: "15",
    class_name: className === ALL ? "" : className,
    status: status === ALL ? "" : status,
  });
  const { data, isLoading, mutate } = useApi<Page<StudentRow>>(`/students?${query}`, { keepPreviousData: true });
  const { data: options } = useApi<Options>("/options");
  const rows = data?.items ?? [];

  const reset = (apply: () => void) => { apply(); setPage(1); setCursor(-1); };

  function onKeyDown(event: React.KeyboardEvent) {
    if (!rows.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => Math.min(c + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (event.key === " " && cursor >= 0) {
      event.preventDefault();
      setQuickLook((current) => (current ? null : rows[cursor]));
    } else if (event.key === "Enter" && cursor >= 0) {
      router.push(`/students/${rows[cursor].student_id}`);
    } else if ((event.key === "Delete" || event.key === "Backspace") && cursor >= 0 && isAdmin) {
      setDeleting(rows[cursor]);
    }
  }

  return (
    <>
      <PageHeader
        title="Sinh viên"
        description={data ? `${data.total.toLocaleString("vi-VN")} sinh viên${user.role === "lecturer" ? " do bạn phụ trách" : ""}` : " "}
        actions={isAdmin && <Button onClick={() => setCreating(true)}><Plus /> Thêm sinh viên</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={risk} onChange={(v) => reset(() => setRisk(v))} className="max-w-full overflow-x-auto"
                   options={[{ value: "", label: "Tất cả" }, ...RISK_LEVELS.map((level) => ({
                     value: level,
                     label: <><span className="size-2 rounded-full" style={{ background: RISK_STYLE[level].color }} />{level}</>,
                   }))]} />
        <div className="flex-1" />
        <SearchField value={keyword} onChange={setKeyword} placeholder="Mã hoặc họ tên" className="w-full sm:w-64" />
        <Select value={className} onValueChange={(v) => reset(() => setClassName(v))}>
          <SelectTrigger className="w-40 rounded-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả các lớp</SelectItem>
            {options?.classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => reset(() => setStatus(v))}>
          <SelectTrigger className="w-36 rounded-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Mọi trạng thái</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div tabIndex={0} onKeyDown={onKeyDown} className="outline-none" aria-label="Danh sách sinh viên, dùng phím mũi tên để chọn">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Sinh viên</TableHead>
                <TableHead className="hidden md:table-cell">Lớp</TableHead>
                <TableHead className="text-right">GPA</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Chuyên cần</TableHead>
                <TableHead className="hidden lg:table-cell">Trạng thái</TableHead>
                <TableHead>Nguy cơ gần nhất</TableHead>
                <TableHead className="w-10 pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && !data && [...Array(10)].map((_, i) => (
                <TableRow key={i}><TableCell colSpan={7} className="px-5"><Skeleton className="h-9 rounded-xl" /></TableCell></TableRow>
              ))}
              {rows.map((s, index) => (
                <ContextMenu key={s.student_id}>
                  <ContextMenuTrigger asChild>
                    <motion.tr
                      data-slot="table-row"
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ ...SOFT_SPRING, delay: Math.min(index, 15) * 0.018 }}
                      onClick={() => router.push(`/students/${s.student_id}`)}
                      onMouseEnter={() => setCursor(index)}
                      className={cn("group border-b border-border/60 transition-colors duration-150 last:border-0",
                        index === cursor ? "bg-primary/10" : "hover:bg-muted/60")}
                    >
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-3">
                          <Monogram name={s.full_name} className="size-8 text-xs" />
                          <div>
                            <div className="font-medium">{s.full_name}</div>
                            <div className="text-xs text-muted-foreground">{s.student_code}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{s.class_name ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{s.gpa?.toFixed(2) ?? "—"}</TableCell>
                      <TableCell className="hidden text-right sm:table-cell">
                        {s.attendance_rate != null ? <AttendanceBar value={s.attendance_rate} /> : "—"}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{STATUS_LABELS[s.status]}</TableCell>
                      <TableCell><RiskBadge level={s.risk_level} probability={s.probability} /></TableCell>
                      <TableCell className="pr-4">
                        <button type="button" aria-label="Xem nhanh" title="Xem nhanh (Space)"
                                onClick={(e) => { e.stopPropagation(); setQuickLook(s); }}
                                className="grid size-7 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted">
                          <Eye className="size-4" />
                        </button>
                      </TableCell>
                    </motion.tr>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuLabel>{s.full_name}</ContextMenuLabel>
                    <ContextMenuItem onSelect={() => router.push(`/students/${s.student_id}`)}><FolderOpen />Mở hồ sơ<ContextMenuShortcut>↵</ContextMenuShortcut></ContextMenuItem>
                    <ContextMenuItem onSelect={() => setQuickLook(s)}><Eye />Xem nhanh<ContextMenuShortcut>Space</ContextMenuShortcut></ContextMenuItem>
                    {isAdmin && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onSelect={() => setEditing(s)}><Pencil />Sửa hồ sơ…</ContextMenuItem>
                        <ContextMenuItem variant="destructive" onSelect={() => setDeleting(s)}><Trash2 />Xoá sinh viên…<ContextMenuShortcut>⌫</ContextMenuShortcut></ContextMenuItem>
                      </>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </TableBody>
          </Table>
          {data && !rows.length && (
            <EmptyState icon={search || risk || className !== ALL || status !== ALL ? SearchX : GraduationCap}
                        title="Không có sinh viên nào" description="Thử đổi từ khoá hoặc bỏ bớt bộ lọc." />
          )}
        </div>
      </Card>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span className="hidden items-center gap-1.5 md:flex">
          <Kbd>↑</Kbd><Kbd>↓</Kbd> chọn · <Kbd>Space</Kbd> xem nhanh · <Kbd>↵</Kbd> mở · chuột phải để thêm thao tác
        </span>
        {data && data.pages > 1 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="tabular-nums">Trang {data.page} / {data.pages}</span>
            <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Trang trước"><ChevronLeft /></Button>
            <Button variant="outline" size="icon" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} aria-label="Trang sau"><ChevronRight /></Button>
          </div>
        )}
      </div>

      <QuickLook student={quickLook} onClose={() => setQuickLook(null)} />

      {isAdmin && (
        <>
          <StudentDialog open={creating} onOpenChange={setCreating}
                         onSaved={(s) => router.push(`/students/${s.student_id}`)} />
          {editing && (
            <StudentDialog key={editing.student_id} student={editing} open onOpenChange={(open) => !open && setEditing(null)}
                           onSaved={() => mutate()} />
          )}
          <ConfirmDelete
            open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}
            title={`Xoá vĩnh viễn ${deleting?.student_code ?? ""}?`}
            description="Toàn bộ điểm số, chuyên cần, lịch sử dự đoán, biên bản gặp mặt và kế hoạch can thiệp của sinh viên này sẽ bị xoá theo. Không khôi phục được."
            confirmLabel="Xoá sinh viên"
            onConfirm={async () => {
              await api(`/students/${deleting!.student_id}`, { method: "DELETE" });
              toast.success(`Đã xoá ${deleting!.student_code}`);
              mutate();
            }}
          />
        </>
      )}
    </>
  );
}

function AttendanceBar({ value }: { value: number }) {
  const tone = value >= 85 ? "bg-risk-low" : value >= 70 ? "bg-risk-medium" : "bg-risk-critical";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.min(value, 100)}%` }} />
      </span>
      <span className="w-9 text-right tabular-nums">{Math.round(value)}%</span>
    </span>
  );
}

/** Xem nhanh hồ sơ không rời danh sách — như Quick Look của Finder. */
function QuickLook({ student, onClose }: { student: StudentRow | null; onClose: () => void }) {
  const { data } = useApi<StudentDetail>(student ? `/students/${student.student_id}` : null);
  const detail = data && student && data.student.student_id === student.student_id ? data : null;

  return (
    <Dialog open={!!student} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {student && (
          <>
            <div className="flex items-center gap-3">
              <Monogram name={student.full_name} className="size-12 text-lg" />
              <div className="min-w-0">
                <DialogTitle className="truncate">{student.full_name}</DialogTitle>
                <p className="text-sm text-muted-foreground">{student.student_code} · {student.class_name ?? "—"} · {STATUS_LABELS[student.status]}</p>
              </div>
            </div>
            <AnimatePresence mode="wait">
              {!detail ? (
                <motion.div key="loading" exit={{ opacity: 0 }}><Skeleton className="h-52 rounded-2xl" /></motion.div>
              ) : (
                <motion.div key="detail" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  {detail.prediction ? (
                    <div className="rounded-2xl bg-muted/50 py-4 text-center">
                      <RiskGauge probability={detail.prediction.probability} level={detail.prediction.risk_level as RiskLevel} size={180} />
                      <p className="mt-2 text-sm text-muted-foreground">{RISK_STYLE[detail.prediction.risk_level].hint}</p>
                    </div>
                  ) : (
                    <p className="rounded-2xl bg-muted/50 p-6 text-center text-sm text-muted-foreground">Chưa có dự đoán.</p>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {([["GPA", detail.features.gpa?.toFixed(2)], ["Chuyên cần", detail.features.attendance_rate != null ? `${Math.round(detail.features.attendance_rate)}%` : null],
                       ["Môn trượt", detail.features.failed_subjects]] as const).map(([label, value]) => (
                      <div key={label} className="rounded-xl bg-muted/50 p-2.5">
                        <div className="text-lg font-semibold tabular-nums">{value ?? "—"}</div>
                        <div className="text-[11px] text-muted-foreground">{label}</div>
                      </div>
                    ))}
                  </div>
                  {!!detail.prediction?.shap_top_factors?.length && (
                    <div className="text-sm">
                      <div className="mb-1 text-xs font-medium text-muted-foreground">Yếu tố chính</div>
                      <div className="flex flex-wrap gap-1.5">
                        {detail.prediction.shap_top_factors.slice(0, 4).map((f) => (
                          <span key={f.feature} className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium",
                            f.effect === "increase" ? "bg-risk-critical/12 text-risk-critical" : "bg-risk-low/12 text-risk-low")}>
                            {f.effect === "increase" ? "↑" : "↓"} {f.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function StudentsPage() {
  return <Suspense><StudentList /></Suspense>;
}
