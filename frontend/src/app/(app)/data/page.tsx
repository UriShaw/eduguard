"use client";

import { Download, FileSpreadsheet, FileUp, LoaderCircle, RefreshCw, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { PageHeader, useUser } from "@/components/app-shell";
import { FadeIn } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, useApi } from "@/lib/api";

const ALL = "all";

interface ImportResult {
  imported: number;
  errors: { row: number | null; message: string }[];
}

/**
 * Quy trình theo đúng thứ tự công việc thực tế trong một học kỳ:
 * nhập dữ liệu → cập nhật dự đoán → xuất báo cáo.
 */
export default function DataPage() {
  const user = useUser();

  return (
    <>
      <PageHeader title="Dữ liệu & báo cáo" description="Nhập dữ liệu hàng loạt, cập nhật dự đoán, xuất báo cáo Excel." />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <FadeIn><ImportCard kind="metrics" step={1} title="Nhập chỉ số học tập"
                            description="GPA, chuyên cần và tương tác cho nhiều sinh viên cùng lúc, khớp theo mã sinh viên." /></FadeIn>
        {user.role === "admin" && (
          <FadeIn delay={0.05}><ImportCard kind="students" title="Nhập danh sách sinh viên"
                                           description="Thêm sinh viên mới. Mã đã tồn tại được bỏ qua, không ghi đè." /></FadeIn>
        )}
        <FadeIn delay={0.1}><BatchCard /></FadeIn>
        <FadeIn delay={0.15}><ReportCard /></FadeIn>
      </div>
    </>
  );
}

function Step({ n }: { n: number }) {
  return <span className="grid size-6 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n}</span>;
}

function ImportCard({ kind, title, description, step }: {
  kind: "metrics" | "students";
  title: string;
  description: string;
  step?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function upload() {
    if (!file) return;
    setBusy(true);
    const body = new FormData();
    body.append("file", file);
    try {
      const r = await api<ImportResult>(`/imports/${kind}`, { method: "POST", body });
      setResult(r);
      if (r.imported) toast.success(`Đã nhập ${r.imported} dòng`);
      if (r.errors.length) toast.warning(`${r.errors.length} dòng không nhập được`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{step && <Step n={step} />}{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <button type="button" onClick={() => input.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); setFile(e.dataTransfer.files[0] ?? null); setResult(null); }}
                className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/30">
          <FileUp className="size-6" />
          {file ? <span className="font-medium text-foreground">{file.name}</span> : "Kéo thả hoặc bấm để chọn file .csv / .xlsx"}
        </button>
        <input ref={input} type="file" accept=".csv,.xlsx,.xls" hidden
               onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />

        {result && (
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <div><b className="text-risk-low">{result.imported}</b> dòng đã nhập
              {!!result.errors.length && <> · <b className="text-risk-critical">{result.errors.length}</b> dòng bị bỏ qua</>}
            </div>
            {!!result.errors.length && (
              <ScrollArea className="mt-2 max-h-40">
                <ul className="space-y-1 text-xs">
                  {result.errors.map((err, i) => (
                    <li key={i}><span className="font-medium">{err.row ? `Dòng ${err.row}` : "Cả file"}:</span> {err.message}</li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <a href={`/api/imports/template/${kind}`}><Download /> File mẫu</a>
        </Button>
        <Button onClick={upload} disabled={!file || busy}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Upload />} Nhập dữ liệu
        </Button>
      </CardFooter>
    </Card>
  );
}

function BatchCard() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ predicted: number; up_to_date: number; skipped: number } | null>(null);

  async function run() {
    setBusy(true);
    try {
      setResult(await api("/predictions/batch", { method: "POST" }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Step n={2} /> Cập nhật dự đoán hàng loạt</CardTitle>
        <CardDescription>
          Chạy lại dự đoán cho mọi sinh viên có chỉ số mới hơn lần dự đoán gần nhất. Sinh viên đã cập nhật được bỏ qua
          nên lịch sử không bị nhân bản.
        </CardDescription>
      </CardHeader>
      {result && (
        <CardContent className="grid grid-cols-3 gap-2 text-center">
          {[["Vừa dự đoán", result.predicted, "text-primary"], ["Đã cập nhật", result.up_to_date, ""],
            ["Thiếu chỉ số", result.skipped, "text-muted-foreground"]].map(([label, value, tone]) => (
            <div key={label as string} className="rounded-lg bg-muted/50 p-3">
              <div className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </CardContent>
      )}
      <CardFooter>
        <Button onClick={run} disabled={busy} className="ml-auto">
          <RefreshCw className={busy ? "animate-spin" : ""} /> Cập nhật ngay
        </Button>
      </CardFooter>
    </Card>
  );
}

function ReportCard() {
  const { data } = useApi<{ classes: string[]; semesters: string[] }>("/reports/options");
  const [className, setClassName] = useState(ALL);
  const [semester, setSemester] = useState(ALL);

  const query = new URLSearchParams({
    class_name: className === ALL ? "" : className,
    semester: semester === ALL ? "" : semester,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Step n={3} /> Xuất báo cáo Excel</CardTitle>
        <CardDescription>Hai sheet: Tổng hợp theo lớp và học kỳ, Chi tiết từng sinh viên.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Lớp</Label>
          <Select value={className} onValueChange={setClassName}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tất cả các lớp</SelectItem>
              {data?.classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Học kỳ</Label>
          <Select value={semester} onValueChange={setSemester}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tất cả các học kỳ</SelectItem>
              {data?.semesters.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Chuyên cần và mức nguy cơ trong báo cáo là số liệu gần nhất, không tách riêng theo học kỳ đang lọc.
        </p>
      </CardContent>
      <CardFooter>
        <Button asChild className="ml-auto">
          <a href={`/api/reports/export?${query}`}><FileSpreadsheet /> Tải file Excel</a>
        </Button>
      </CardFooter>
    </Card>
  );
}
