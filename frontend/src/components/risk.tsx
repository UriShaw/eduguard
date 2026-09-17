"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/lib/api";

/** Mỗi mức nguy cơ một màu, lấy từ biến CSS trong globals.css — nhãn, biểu đồ, thước đo dùng chung. */
export const RISK_STYLE: Record<RiskLevel, { color: string; badge: string; hint: string }> = {
  "Thấp": {
    color: "var(--risk-low)",
    badge: "bg-risk-low/12 text-risk-low ring-risk-low/25",
    hint: "Tiếp tục theo dõi định kỳ",
  },
  "Trung bình": {
    color: "var(--risk-medium)",
    badge: "bg-risk-medium/15 text-[color-mix(in_oklch,var(--risk-medium),black_25%)] ring-risk-medium/30",
    hint: "Nên trao đổi sớm với sinh viên",
  },
  "Cao": {
    color: "var(--risk-high)",
    badge: "bg-risk-high/12 text-risk-high ring-risk-high/25",
    hint: "Cần lập kế hoạch can thiệp",
  },
  "Rất cao": {
    color: "var(--risk-critical)",
    badge: "bg-risk-critical/12 text-risk-critical ring-risk-critical/25",
    hint: "Cần can thiệp ngay",
  },
};

export function RiskBadge({ level, probability, className }: {
  level: RiskLevel | null;
  probability?: number | null;
  className?: string;
}) {
  if (!level) {
    return <span className={cn("text-xs text-muted-foreground", className)}>Chưa dự đoán</span>;
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
      RISK_STYLE[level].badge, className)}>
      <span className="size-1.5 rounded-full" style={{ background: RISK_STYLE[level].color }} />
      {level}
      {probability != null && <span className="tabular-nums opacity-75">{Math.round(probability * 100)}%</span>}
    </span>
  );
}

/**
 * Thước đo nửa vòng tròn. Kim chạy từ 0 tới giá trị thật khi xuất hiện, để mắt
 * đọc được "nằm ở đâu trên thang" trước khi đọc con số.
 */
export function RiskGauge({ probability, level, size = 200 }: {
  probability: number;
  level: RiskLevel;
  size?: number;
}) {
  const radius = 80;
  const arc = Math.PI * radius;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size * 0.62 }}>
      <svg viewBox="0 0 200 124" className="w-full">
        <path d="M 20 104 A 80 80 0 0 1 180 104" fill="none" stroke="var(--muted)" strokeWidth={16}
              strokeLinecap="round" />
        <motion.path
          d="M 20 104 A 80 80 0 0 1 180 104"
          fill="none"
          stroke={RISK_STYLE[level].color}
          strokeWidth={16}
          strokeLinecap="round"
          strokeDasharray={arc}
          initial={{ strokeDashoffset: arc }}
          animate={{ strokeDashoffset: arc * (1 - probability) }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <motion.div
          className="text-4xl font-bold tabular-nums tracking-tight"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {Math.round(probability * 100)}%
        </motion.div>
        <div className="text-xs text-muted-foreground">xác suất bỏ học</div>
      </div>
    </div>
  );
}
