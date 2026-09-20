"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Download, FileSpreadsheet, FileUp, LoaderCircle, RefreshCw, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { PageHeader, useUser } from "@/components/app-shell";
import { Choice } from "@/components/dialogs";
import { AnimatedNumber, SOFT_SPRING } from "@/components/mac/controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { api, useApi } from "@/lib/api";
import { cn } from "cn";

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
  const cards = [
    <ImportCard key="metrics" kind="metrics" step={1} title="Nhập chỉ số học tập"
                description="GPA, chuyên cần và tương tác cho nhiều sinh viên cùng lúc, khớp theo mã sinh viên." />,
    ...(user.role === "admin" ? [<ImportCard key="students" kind="students" title="Nhập danh sách sinh viên"
                                             description="Thêm sinh viên mới. Mã đã tồn tại được bỏ qua, không ghi đè." />] : []),
    <BatchCard key="batch" />,
    <ReportCard key="report" />,
  ];

  return (
    <>
      <PageHeader title="Dữ liệu & báo cáo" description="Nhập dữ liệu hàng loạt, cập nhật dự đoán, xuất báo cáo Excel." />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {cards.map((card, i) => (
          <motion.div key={card.key} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT_SPRING, delay: i * 0.06 }}>
            {card}
          </motion.div>
        ))}
      </div>
    </>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="grid size-6 place-items-center rounded-full bg-gradient-to-b from-sky-400 to-blue-600 text-xs font-semibold text-white shadow-[inset_0_1px_0_oklch(1_0_0/35%)]">
      {n}
    </span>
  );
}

function ImportCard({ kind, title, description, step }: {
  kind: "metrics" | "students";
  title: string;
  description: string;
  step?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const choose = (next: File | null) => { setFile(next); setResult(null); };

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
        <motion.button type="button" onClick={() => input.current?.click()}
                       onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                       onDragLeave={() => setDragging(false)}
                       onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files[0] ?? null); }}
                       animate={{ scale: dragging ? 1.02 : 1 }} transition={SOFT_SPRING}
                       className={cn("flex w-full flex-col items-center gap-2 rounded-[18px] border-2 border-dashed p-7 text-sm text-muted-foreground transition-colors",
                         dragging ? "border-primary bg-primary/8 text-primary" : "border-border hover:border-primary/40 hover:bg-muted/40")}>
          <AnimatePresence mode="wait">
            {file ? (
              <motion.span key="file" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                           className="flex flex-col items-center gap-2">
                <span className="grid size-12 place-items-center rounded-[14px] bg-gradient-to-b from-emerald-400 to-green-600 text-white shadow-lg shadow-green-500/25">
                  <FileSpreadsheet className="size-6" />
                </span>
                <span className="font-medium text-foreground">{file.name}</span>
                <span className="text-xs">{(file.size / 1024).toFixed(1)} KB</span>
              </motion.span>
            ) : (
              <motion.span key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                           className="flex flex-col items-center gap-2">
                <motion.span animate={dragging ? { y: -4 } : { y: 0 }}><FileUp className="size-7" /></motion.span>
                Kéo thả hoặc bấm để chọn file .csv / .xlsx
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
        <input ref={input} type="file" accept=".csv,.xlsx,.xls" hidden onChange={(e) => choose(e.target.files?.[0] ?? null)} />

        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden">
              <div className="rounded-2xl bg-muted/50 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-risk-low" />
                  <b className="text-risk-low"><AnimatedNumber value={result.imported} /></b> dòng đã nhập
                  {!!result.errors.length && <> · <b className="text-risk-critical">{result.errors.length}</b> dòng bị bỏ qua</>}
                </div>
                {!!result.errors.length && (
                  <ul className="mac-scroll mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
                    {result.errors.map((err, i) => (
                      <li key={i} className="flex gap-1.5"><X className="size-3.5 shrink-0 text-risk-critical" />
                        <span><span className="font-medium">{err.row ? `Dòng ${err.row}` : "Cả file"}:</span> {err.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
            <CardContent className="grid grid-cols-3 gap-2 text-center">
              {([["Vừa dự đoán", result.predicted, "text-primary"], ["Đã cập nhật", result.up_to_date, ""],
                 ["Thiếu chỉ số", result.skipped, "text-muted-foreground"]] as const).map(([label, value, tone]) => (
                <div key={label} className="rounded-2xl bg-muted/50 p-3">
                  <div className={cn("font-heading text-2xl font-bold", tone)}><AnimatedNumber value={value} /></div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
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
          <Choice value={className} onChange={setClassName}
                  options={[[ALL, "Tất cả các lớp"], ...(data?.classes ?? []).map((c) => [c, c] as [string, string])]} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Học kỳ</Label>
          <Choice value={semester} onChange={setSemester}
                  options={[[ALL, "Tất cả các học kỳ"], ...(data?.semesters ?? []).map((s) => [s, s] as [string, string])]} />
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
