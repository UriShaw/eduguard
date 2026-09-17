"use client";

import { AnimatePresence, motion } from "framer-motion";
import { LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { FactorList, Simulator, Suggestions } from "@/components/insight";
import { RISK_STYLE, RiskBadge, RiskGauge } from "@/components/risk";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type Factor, type Features, type PredictionResult, type Suggestion } from "@/lib/api";

const GROUPS: { title: string; fields: [keyof Features, string, number, number, number][] }[] = [
  { title: "Học tập", fields: [["gpa", "Điểm trung bình", 0, 10, 0.01], ["failed_subjects", "Số môn trượt", 0, 20, 1],
      ["credits_completed", "Tín chỉ tích luỹ", 0, 200, 1]] },
  { title: "Chuyên cần", fields: [["attendance_rate", "Tỷ lệ chuyên cần (%)", 0, 100, 0.1]] },
  { title: "Tương tác", fields: [["login_count", "Số lần đăng nhập", 0, 500, 1], ["assignment_submitted", "Bài tập đã nộp", 0, 100, 1],
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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api<Result>("/predictions/try", { method: "POST", json: values });
      setResult({ data, input: values });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Dự đoán nhanh"
        description="Nhập chỉ số bất kỳ để xem model đánh giá thế nào. Kết quả không gắn với sinh viên nào và không được lưu."
      />

      <div className="grid items-start gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardContent>
            <form onSubmit={submit} className="space-y-5">
              {GROUPS.map((group) => (
                <fieldset key={group.title}>
                  <legend className="mb-2 text-sm font-semibold">{group.title}</legend>
                  <div className="grid grid-cols-2 gap-3">
                    {group.fields.map(([key, label, min, max, step]) => (
                      <div key={key} className="space-y-1">
                        <Label htmlFor={key} className="text-xs text-muted-foreground">{label}</Label>
                        <Input id={key} type="number" required min={min} max={max} step={step} value={values[key]}
                               onChange={(e) => setValues((v) => ({ ...v, [key]: Number(e.target.value) }))} />
                      </div>
                    ))}
                  </div>
                </fieldset>
              ))}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />} Dự đoán
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4 xl:col-span-3">
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div key={result.data.probability} className="space-y-4"
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card>
                  <CardContent className="grid items-center gap-6 sm:grid-cols-2">
                    <RiskGauge probability={result.data.probability} level={result.data.risk_level} />
                    <div className="space-y-2 text-center sm:text-left">
                      <RiskBadge level={result.data.risk_level} className="text-sm" />
                      <p className="text-lg font-medium">{RISK_STYLE[result.data.risk_level].hint}</p>
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
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center gap-3 py-24 text-center text-muted-foreground">
                    <Sparkles className="size-8 opacity-40" />
                    <p>Điền chỉ số bên trái rồi bấm <b>Dự đoán</b>.<br />Đã có sẵn một bộ số mẫu để thử ngay.</p>
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
