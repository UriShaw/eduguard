"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Lightbulb, Plus, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { RiskBadge } from "@/components/risk";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { api, type Factor, type FeatureKey, type Features, type SimulationResult, type Suggestion } from "@/lib/api";
import { cn } from "cn";

/** Các yếu tố ảnh hưởng mạnh nhất. Độ dài thanh là mức ảnh hưởng TƯƠNG ĐỐI giữa các yếu tố. */
export function FactorList({ factors }: { factors: Factor[] }) {
  const widest = Math.max(...factors.map((f) => Math.abs(f.shap_value)), 1e-9);

  return (
    <div className="space-y-3">
      {factors.map((factor, index) => {
        const up = factor.effect === "increase";
        return (
          <motion.div key={factor.feature} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.06 }}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                {up ? <ArrowUpRight className="size-4 text-risk-critical" /> : <ArrowDownRight className="size-4 text-risk-low" />}
                {factor.label}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">giá trị {factor.value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <motion.div
                className={cn("h-full rounded-full", up ? "bg-risk-critical" : "bg-risk-low")}
                initial={{ width: 0 }}
                animate={{ width: `${(Math.abs(factor.shap_value) / widest) * 100}%` }}
                transition={{ duration: 0.6, delay: index * 0.06 }}
              />
            </div>
          </motion.div>
        );
      })}
      <p className="pt-1 text-xs text-muted-foreground">
        <span className="text-risk-critical">Đỏ</span> đẩy nguy cơ lên, <span className="text-risk-low">xanh</span> kéo
        xuống. Thanh dài hơn ảnh hưởng nhiều hơn — không phải số phần trăm.
      </p>
    </div>
  );
}

/** Hạn mặc định cho việc thêm từ gợi ý: hai tuần, đủ để thấy tác dụng mà không để trôi. */
function dueInTwoWeeks() {
  return new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Gợi ý việc cần làm suy ra từ các yếu tố đang đẩy nguy cơ lên.
 * Một chạm để đưa vào kế hoạch — nối thẳng kết quả dự đoán với hành động.
 */
export function Suggestions({ items, studentId, onAdded }: {
  items: Suggestion[];
  studentId?: number;
  onAdded?: () => void;
}) {
  const [adding, setAdding] = useState<string | null>(null);

  async function add(suggestion: Suggestion) {
    if (!studentId) return;
    setAdding(suggestion.title);
    try {
      const due = dueInTwoWeeks();
      await api(`/students/${studentId}/interventions`, {
        method: "POST",
        json: { category: suggestion.category, title: suggestion.title, description: suggestion.description, due_date: due },
      });
      toast.success("Đã thêm vào kế hoạch can thiệp", { description: `${suggestion.title} — hạn sau 2 tuần` });
      onAdded?.();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setAdding(null);
    }
  }

  if (!items.length) {
    return <p className="text-sm text-muted-foreground">Không có gợi ý mới — các hướng xử lý chính đã nằm trong kế hoạch.</p>;
  }

  return (
    <div className="space-y-2.5">
      <AnimatePresence initial={false}>
        {items.map((s) => (
          <motion.div key={s.title} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-start gap-3 rounded-lg border bg-card p-3">
            <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-risk-medium/15">
              <Lightbulb className="size-4 text-[color-mix(in_oklch,var(--risk-medium),black_25%)]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{s.title}</div>
              <p className="text-xs text-muted-foreground">{s.description}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Vì: {s.reason} đang làm tăng nguy cơ</p>
            </div>
            {studentId && (
              <Button size="sm" variant="outline" disabled={adding === s.title} onClick={() => add(s)}>
                <Plus /> Thêm
              </Button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ===== Mô phỏng "nếu… thì" =====

/** Những chỉ số cố vấn thực sự tác động được qua can thiệp. */
const LEVERS: { key: FeatureKey; label: string; min: number; max: number; step: number; unit?: string }[] = [
  { key: "attendance_rate", label: "Tỷ lệ chuyên cần", min: 0, max: 100, step: 1, unit: "%" },
  { key: "gpa", label: "Điểm trung bình", min: 0, max: 10, step: 0.1 },
  { key: "assignment_missing", label: "Bài tập còn thiếu", min: 0, max: 15, step: 1 },
  { key: "failed_subjects", label: "Số môn trượt", min: 0, max: 8, step: 1 },
  { key: "login_count", label: "Số lần đăng nhập", min: 0, max: 45, step: 1 },
];

export function Simulator({ base }: { base: Features }) {
  const [changes, setChanges] = useState<Partial<Features>>({});
  const [result, setResult] = useState<SimulationResult | null>(null);
  const scenario = useMemo(() => ({ ...base, ...changes }), [base, changes]);

  useEffect(() => {
    // Chờ người dùng dừng kéo thanh trượt rồi mới gọi API, tránh bắn hàng chục request.
    const timer = setTimeout(() => {
      api<SimulationResult>("/simulate", { method: "POST", json: { base, changes } })
        .then(setResult)
        .catch((error) => toast.error((error as Error).message));
    }, 250);
    return () => clearTimeout(timer);
  }, [base, changes]);

  const delta = result?.delta ?? 0;

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_220px]">
      <div className="space-y-5">
        {LEVERS.map((lever) => {
          const value = scenario[lever.key];
          const shown = (v: number) => Number(v.toFixed(lever.step < 1 ? 1 : 0));
          const changed = changes[lever.key] !== undefined && changes[lever.key] !== base[lever.key];
          return (
            <div key={lever.key}>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className={cn(changed && "font-medium text-primary")}>{lever.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {changed && <span className="mr-1 line-through opacity-60">{shown(base[lever.key])}</span>}
                  <span className={cn(changed && "font-semibold text-foreground")}>{shown(value)}{lever.unit}</span>
                </span>
              </div>
              <Slider value={[value]} min={lever.min} max={lever.max} step={lever.step}
                      onValueChange={([v]) => setChanges((c) => ({ ...c, [lever.key]: v }))} />
            </div>
          );
        })}
      </div>

      <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-muted/50 p-5 text-center">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Nguy cơ sau thay đổi</div>
        <motion.div key={result?.after.probability} initial={{ scale: 0.9, opacity: 0.4 }}
                    animate={{ scale: 1, opacity: 1 }} className="text-4xl font-bold tabular-nums">
          {result ? Math.round(result.after.probability * 100) : "—"}%
        </motion.div>
        {result && <RiskBadge level={result.after.risk_level} />}
        {result && delta !== 0 && (
          <div className={cn("text-sm font-medium", delta < 0 ? "text-risk-low" : "text-risk-critical")}>
            {delta > 0 ? "+" : ""}{delta} điểm so với hiện tại
          </div>
        )}
        {!!result?.outside_training_range.length && (
          <p className="flex gap-1.5 text-left text-[11px] text-risk-high">
            <TriangleAlert className="size-3.5 shrink-0" />
            {result.outside_training_range.join(", ")} nằm ngoài vùng dữ liệu model đã học — kết quả kém tin cậy.
          </p>
        )}
        {Object.keys(changes).length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setChanges({})}><RotateCcw /> Đặt lại</Button>
        )}
      </div>
    </div>
  );
}
