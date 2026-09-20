"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, CalendarCheck, LoaderCircle, MousePointerClick, RotateCcw, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { FactorList, Simulator, Suggestions } from "@/components/insight";
import { SOFT_SPRING } from "@/components/mac/controls";
import { RISK_STYLE, RiskBadge, RiskGauge } from "@/components/risk";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type Factor, type Features, type PredictionResult, type Suggestion } from "@/lib/api";
import { cn } from "cn";

const GROUPS: { title: string; icon: React.ElementType; tint: string; fields: [keyof Features, string, number, number, number][] }[] = [
  { title: "Học tập", icon: BookOpen, tint: "from-sky-400 to-blue-600",
    fields: [["gpa", "Điểm trung bình", 0, 10, 0.01], ["failed_subjects", "Số môn trượt", 0, 20, 1], ["credits_completed", "Tín chỉ tích luỹ", 0, 200, 1]] },
  { title: "Chuyên cần", icon: CalendarCheck, tint: "from-emerald-400 to-teal-600",
    fields: [["attendance_rate", "Tỷ lệ chuyên cần (%)", 0, 100, 0.1]] },
  { title: "Tương tác", icon: MousePointerClick, tint: "from-violet-400 to-purple-600",
    fields: [["login_count", "Số lần đăng nhập", 0, 500, 1], ["assignment_submitted", "Bài tập đã nộp", 0, 100, 1],
      ["assignment_missing", "Bài tập còn thiếu", 0, 100, 1], ["forum_posts", "Bài đăng diễn đàn", 0, 100, 1],
      ["video_views", "Lượt xem bài giảng", 0, 500, 1], ["learning_hours", "Số giờ học", 0, 500, 0.1]] },
];

const EXAMPLE: Features = {
  gpa: 5.4, failed_subjects: 2, credits_completed: 62, attendance_rate: 68, login_count: 16,
  assignment_submitted: 6, assignment_missing: 4, forum_posts: 1, video_views: 20, learning_hours: 6,
};

type Result = PredictionResult & { factors: Factor[]; suggestions: Suggestion[] };

export default function PredictPage() {
  const [values, setValues] = useState<Features>(EXAMPLE);
  const [result, setResult] = useState<{ data: Result; input: Features } | null>(null);
  const [busy, setBusy] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api<Result>("/predictions/try", { method: "POST", json: values });
      setResult({ data, input: values });
      // Màn hình hẹp: kết quả nằm dưới form, cuộn xuống để người dùng thấy ngay.
      if (window.innerWidth < 1280) setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Dự đoán nhanh"
                  description="Nhập chỉ số bất kỳ để xem model đánh giá thế nào. Kết quả không gắn với sinh viên nào và không được lưu." />

      <div className="grid items-start gap-4 xl:grid-cols-5">
        <Card className="xl:sticky xl:top-2 xl:col-span-2">
          <CardContent>
            <form onSubmit={submit} className="space-y-5">
              {GROUPS.map((group, gi) => (
                <motion.fieldset key={group.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                 transition={{ ...SOFT_SPRING, delay: gi * 0.06 }}>
                  <legend className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
                    <span className={cn("grid size-6 place-items-center rounded-[7px] bg-gradient-to-b text-white", group.tint)}><group.icon className="size-3.5" /></span>
                    {group.title}
                  </legend>
                  <div className="grid grid-cols-2 gap-3">
                    {group.fields.map(([key, label, min, max, step]) => (
                      <div key={key} className="space-y-1">
                        <Label htmlFor={key} className="text-xs text-muted-foreground">{label}</Label>
                        <Input id={key} type="number" required min={min} max={max} step={step} value={values[key]}
                               onChange={(e) => setValues((v) => ({ ...v, [key]: Number(e.target.value) }))} />
                      </div>
                    ))}
                  </div>
                </motion.fieldset>
              ))}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => { setValues(EXAMPLE); setResult(null); }} aria-label="Đặt lại số mẫu">
                  <RotateCcw />
                </Button>
                <Button type="submit" size="lg" className="flex-1" disabled={busy}>
                  {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />} Dự đoán
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div ref={resultRef} className="scroll-mt-20 space-y-4 xl:col-span-3">
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div key={`${result.data.probability}-${JSON.stringify(result.input)}`} className="space-y-4"
                          initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, filter: "blur(4px)" }} transition={SOFT_SPRING}>
                <Card className="overflow-visible">
                  <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 rounded-[22px] opacity-40 blur-2xl"
                       style={{ background: `radial-gradient(60% 80% at 25% 50%, ${RISK_STYLE[result.data.risk_level].color}, transparent)` }} />
                  <CardContent className="grid items-center gap-6 sm:grid-cols-2">
                    <RiskGauge probability={result.data.probability} level={result.data.risk_level} />
                    <div className="space-y-2 text-center sm:text-left">
                      <RiskBadge level={result.data.risk_level} className="text-sm" />
                      <p className="font-heading text-2xl font-semibold tracking-tight">{RISK_STYLE[result.data.risk_level].hint}</p>
                      <p className="text-xs text-muted-foreground">Model {result.data.model_version}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Vì sao</CardTitle></CardHeader>
                  <CardContent><FactorList factors={result.data.factors} /></CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Hướng can thiệp phù hợp</CardTitle></CardHeader>
                  <CardContent><Suggestions items={result.data.suggestions} /></CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Nếu… thì sao?</CardTitle>
                    <CardDescription>Thay đổi chỉ số để xem nguy cơ giảm được bao nhiêu</CardDescription>
                  </CardHeader>
                  <CardContent><Simulator base={result.input} /></CardContent>
                </Card>
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Card>
                  <CardContent className="flex flex-col items-center gap-4 py-24 text-center text-muted-foreground">
                    <motion.div animate={{ y: [0, -6, 0], rotate: [0, 6, -6, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                className="grid size-16 place-items-center rounded-[20px] bg-gradient-to-b from-violet-400 to-purple-600 text-white shadow-xl shadow-purple-500/30">
                      <Sparkles className="size-8" />
                    </motion.div>
                    <p>Điền chỉ số rồi bấm <b className="text-foreground">Dự đoán</b>.<br />Đã có sẵn một bộ số mẫu để thử ngay.</p>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
