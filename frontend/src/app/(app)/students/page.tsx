"use client";

import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { PageHeader, useUser } from "@/components/app-shell";
import { StudentDialog } from "@/components/dialogs";
import { RISK_STYLE, RiskBadge } from "@/components/risk";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RISK_LEVELS, STATUS_LABELS, useApi, type Options, type Page, type StudentRow } from "@/lib/api";
import { cn } from "cn";

const ALL = "all";

function StudentList() {
  const user = useUser();
  const router = useRouter();
  const params = useSearchParams();

  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  const [risk, setRisk] = useState(params.get("risk") ?? "");
  const [className, setClassName] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(1);

  // Chờ người dùng ngừng gõ rồi mới tìm, tránh gọi API ở mỗi phím bấm.
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(keyword); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  const query = new URLSearchParams({
    keyword: search, risk, page: String(page),
    class_name: className === ALL ? "" : className,
    status: status === ALL ? "" : status,
  });
  const { data, isLoading } = useApi<Page<StudentRow>>(`/students?${query}`, { keepPreviousData: true });
  const { data: options } = useApi<Options>("/options");

  const reset = (apply: () => void) => { apply(); setPage(1); };

  return (
    <>
      <PageHeader
        title="Sinh viên"
        description={data ? `${data.total} sinh viên${user.role === "lecturer" ? " do bạn phụ trách" : ""}` : " "}
        actions={user.role === "admin" && (
          <StudentDialog trigger={<Button><Plus /> Thêm sinh viên</Button>}
                         onSaved={(s) => router.push(`/students/${s.student_id}`)} />
        )}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {["", ...RISK_LEVELS].map((level) => (
          <button key={level || "all"} onClick={() => reset(() => setRisk(level))}
                  className={cn("rounded-full border px-3 py-1 text-sm transition-colors",
                    risk === level ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {level && <span className="mr-1.5 inline-block size-2 rounded-full"
                            style={{ background: RISK_STYLE[level as keyof typeof RISK_STYLE].color }} />}
            {level || "Tất cả"}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Tìm theo mã hoặc họ tên…" value={keyword}
                 onChange={(e) => setKeyword(e.target.value)} />
        </div>
        <Select value={className} onValueChange={(v) => reset(() => setClassName(v))}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả các lớp</SelectItem>
            {options?.classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => reset(() => setStatus(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Mọi trạng thái</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="pl-4">Sinh viên</TableHead>
              <TableHead>Lớp</TableHead>
              <TableHead className="text-right">GPA</TableHead>
              <TableHead className="text-right">Chuyên cần</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="pr-4">Nguy cơ gần nhất</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && !data && [...Array(8)].map((_, i) => (
              <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-8" /></TableCell></TableRow>
            ))}
            {data?.items.map((s) => (
              <TableRow key={s.student_id} className="cursor-pointer" onClick={() => router.push(`/students/${s.student_id}`)}>
                <TableCell className="pl-4">
                  <div className="font-medium">{s.full_name}</div>
                  <div className="text-xs text-muted-foreground">{s.student_code}</div>
                </TableCell>
                <TableCell className="text-muted-foreground">{s.class_name ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{s.gpa?.toFixed(2) ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.attendance_rate != null ? `${Math.round(s.attendance_rate)}%` : "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{STATUS_LABELS[s.status]}</TableCell>
                <TableCell className="pr-4"><RiskBadge level={s.risk_level} probability={s.probability} /></TableCell>
              </TableRow>
            ))}
            {data && !data.items.length && (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  Không có sinh viên nào khớp bộ lọc.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {data && data.pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-3 text-sm">
          <span className="text-muted-foreground">Trang {data.page} / {data.pages}</span>
          <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Trang trước">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} aria-label="Trang sau">
            <ChevronRight />
          </Button>
        </div>
      )}
    </>
  );
}

export default function StudentsPage() {
  return <Suspense><StudentList /></Suspense>;
}
