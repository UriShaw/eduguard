"use client";

import { animate, motion, useInView, useMotionValue, useTransform } from "framer-motion";
import { Search, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

import { cn } from "cn";

export const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 } as const;
export const SOFT_SPRING = { type: "spring", stiffness: 260, damping: 28 } as const;

/**
 * Segmented control kiểu macOS: viên sáng trượt sang lựa chọn mới bằng lò xo,
 * thay vì nhảy tức thời.
 */
export function Segmented<T extends string>({ value, onChange, options, className, size = "md" }: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: React.ReactNode; icon?: React.ElementType }[];
  className?: string;
  size?: "sm" | "md";
}) {
  const id = useId();
  return (
    <div role="tablist"
         className={cn("relative inline-flex items-center gap-0.5 rounded-full bg-muted p-[3px] shadow-[inset_0_1px_2px_oklch(0.2_0.02_264/10%)] backdrop-blur-md",
           className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button key={option.value} role="tab" aria-selected={active} type="button" onClick={() => onChange(option.value)}
                  className={cn("relative z-0 inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors duration-200",
                    size === "sm" ? "h-6 px-2.5 text-xs" : "h-7 px-3.5 text-[13px]",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {active && (
              <motion.span layoutId={`seg-${id}`} transition={SPRING}
                           className="absolute inset-0 -z-10 rounded-full bg-(--glass-strong) shadow-[inset_0_1px_0_oklch(1_0_0/55%),0_1px_3px_oklch(0.2_0.02_264/18%)] dark:bg-white/16" />
            )}
            {option.icon && <option.icon className="size-3.5" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Ô tìm kiếm bo tròn như thanh công cụ Finder. */
export function SearchField({ value, onChange, placeholder = "Tìm kiếm", className, autoFocus }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className={cn("group relative flex h-8 min-w-48 items-center rounded-full bg-(--field) pr-2 pl-8 shadow-[inset_0_1px_2px_oklch(0.2_0.02_264/8%)] ring-1 ring-foreground/[0.06] backdrop-blur-md transition-shadow focus-within:ring-3 focus-within:ring-ring/45",
      className)}>
      <Search className="absolute left-2.5 size-4 text-muted-foreground" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
             className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
      {value && (
        <button type="button" aria-label="Xoá tìm kiếm" onClick={() => onChange("")}
                className="grid size-4 place-items-center rounded-full bg-muted-foreground/50 text-background">
          <X className="size-3" strokeWidth={3} />
        </button>
      )}
    </label>
  );
}

/** Số chạy từ giá trị cũ tới giá trị mới khi đổi, và từ 0 khi lần đầu cuộn tới. */
export function AnimatedNumber({ value, format = (v) => Math.round(v).toLocaleString("vi-VN"), className }: {
  value: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const motionValue = useMotionValue(0);
  const text = useTransform(motionValue, format);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(motionValue, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [inView, motionValue, value]);

  return <motion.span ref={ref} className={cn("tabular-nums", className)}>{text}</motion.span>;
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-muted px-1.5 font-sans text-[11px] font-medium text-muted-foreground shadow-[inset_0_-1px_0_oklch(0.2_0.02_264/12%)]",
      className)}>
      {children}
    </kbd>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }: {
  icon: React.ElementType;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={SOFT_SPRING}
                className={cn("flex flex-col items-center gap-2 px-6 py-12 text-center", className)}>
      <div className="mb-1 grid size-14 place-items-center rounded-[18px] bg-muted text-muted-foreground shadow-[inset_0_1px_0_oklch(1_0_0/40%)]">
        <Icon className="size-7" strokeWidth={1.6} />
      </div>
      <div className="font-semibold">{title}</div>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </motion.div>
  );
}

const AVATAR_TINTS = [
  "from-sky-400 to-blue-600", "from-violet-400 to-purple-600", "from-emerald-400 to-teal-600",
  "from-amber-300 to-orange-500", "from-rose-400 to-pink-600", "from-cyan-400 to-sky-600",
];

/** Ảnh đại diện chữ cái trên nền gradient cố định theo tên — cùng người luôn cùng màu. */
export function Monogram({ name, className }: { name: string; className?: string }) {
  const hash = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const letter = (name.trim().split(/\s+/).pop()?.[0] ?? "?").toUpperCase();
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-semibold text-white shadow-[inset_0_1px_0_oklch(1_0_0/40%),0_1px_2px_oklch(0_0_0/20%)]",
      AVATAR_TINTS[hash % AVATAR_TINTS.length], className ?? "size-8 text-sm")}>
      {letter}
    </span>
  );
}

/** Nhóm dòng trong một khung kính, như danh sách trong Cài đặt hệ thống. */
export function GroupedList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("divide-y divide-border/70 overflow-hidden rounded-[18px] bg-card ring-1 ring-foreground/[0.07] shadow-[inset_0_1px_0_oklch(1_0_0/35%)] dark:ring-white/10",
      className)}>
      {children}
    </div>
  );
}

export function GroupedRow({ icon: Icon, tint, title, description, children, className }: {
  icon?: React.ElementType;
  tint?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-12 items-center gap-3 px-4 py-2.5", className)}>
      {Icon && (
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-[8px] bg-gradient-to-br text-white shadow-[inset_0_1px_0_oklch(1_0_0/35%)]",
          tint ?? "from-zinc-400 to-zinc-600")}>
          <Icon className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
      </div>
      {children}
    </div>
  );
}
