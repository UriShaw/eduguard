"use client";

import {
  AnimatePresence, motion, type MotionValue, useAnimationControls, useMotionValue, useSpring, useTransform,
} from "framer-motion";
import { Lock, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

import { isActive, type NavItem } from "@/lib/navigation";
import { usePreferences } from "@/lib/preferences";
import { cn } from "cn";

const BASE = 50;
const PEAK = 82;
const REACH = 160;

interface DockAction {
  key: string;
  label: string;
  icon: React.ElementType;
  tint: string;
  href?: string;
  onClick?: () => void;
  badge?: number;
}

/**
 * Dock phóng to theo khoảng cách tới con trỏ, tính trên trục ngang như Dock thật:
 * biểu tượng gần chuột nhất to nhất, các biểu tượng lân cận to dần theo đường cong mượt.
 */
export function Dock({ items, alerts, hidden, onSpotlight, onLock }: {
  items: NavItem[];
  alerts: number;
  hidden?: boolean;
  onSpotlight: () => void;
  onLock: () => void;
}) {
  const { prefs } = usePreferences();
  const mouseX = useMotionValue(Infinity);
  const [revealed, setRevealed] = useState(false);

  const apps: DockAction[] = items.map((item) => ({
    key: item.href, label: item.label, icon: item.icon, tint: item.tint, href: item.href,
    badge: item.href === "/alerts" ? alerts : undefined,
  }));
  const utilities: DockAction[] = [
    { key: "spotlight", label: "Spotlight", icon: Search, tint: "from-zinc-500 to-zinc-800", onClick: onSpotlight },
    { key: "lock", label: "Khoá màn hình", icon: Lock, tint: "from-zinc-600 to-zinc-900", onClick: onLock },
  ];
  const show = !hidden || revealed;

  return (
    <>
      {/* Chế độ toàn màn hình: Dock ẩn, đưa chuột xuống mép dưới để gọi lại. */}
      {hidden && <div className="fixed inset-x-0 bottom-0 z-40 h-2" onMouseEnter={() => setRevealed(true)} />}

      <motion.nav
        aria-label="Dock"
        initial={false}
        animate={{ y: show ? 0 : 120, opacity: show ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onMouseLeave={() => { mouseX.set(Infinity); setRevealed(false); }}
        onMouseMove={(e) => prefs.dockMagnify && mouseX.set(e.clientX)}
        className="fixed bottom-2 left-1/2 z-40 hidden -translate-x-1/2 lg:block"
      >
        <div className="glass liquid-lens rim flex h-[66px] items-end gap-2 rounded-[24px] px-2.5 pb-2">
          {apps.map((app) => <DockIcon key={app.key} action={app} mouseX={mouseX} />)}
          <div className="mx-1 mb-1 h-11 w-px self-end bg-foreground/15" />
          {utilities.map((app) => <DockIcon key={app.key} action={app} mouseX={mouseX} />)}
        </div>
      </motion.nav>

      {/* Màn hình nhỏ: thanh tab kính cố định, không phóng to. */}
      <nav aria-label="Điều hướng" className="fixed inset-x-3 bottom-3 z-40 lg:hidden">
        <div className="glass rim flex items-center justify-around gap-0.5 rounded-[22px] px-1.5 py-1.5">
          {[...apps, utilities[0]].map((app) => <MobileTab key={app.key} action={app} />)}
        </div>
      </nav>
    </>
  );
}

function DockIcon({ action, mouseX }: { action: DockAction; mouseX: MotionValue<number> }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const controls = useAnimationControls();
  const [hover, setHover] = useState(false);

  const distance = useTransform(mouseX, (x) => {
    const bounds = ref.current?.getBoundingClientRect();
    return bounds ? x - (bounds.left + bounds.width / 2) : Infinity;
  });
  const target = useTransform(distance, [-REACH, 0, REACH], [BASE, PEAK, BASE], { clamp: true });
  const size = useSpring(target, { mass: 0.1, stiffness: 170, damping: 13 });
  const active = action.href ? isActive(action.href, pathname) : false;

  const bounce = () => controls.start({ y: [0, -22, 0, -8, 0], transition: { duration: 0.7, ease: "easeOut" } });

  const icon = (
    <motion.div ref={ref} style={{ width: size, height: size }} animate={controls}
                onHoverStart={() => setHover(true)} onHoverEnd={() => setHover(false)}
                className="relative">
      <AnimatePresence>
        {hover && (
          <motion.span initial={{ opacity: 0, y: 6, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                       exit={{ opacity: 0, y: 4, scale: 0.95 }} transition={{ duration: 0.15 }}
                       className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 rounded-lg bg-popover px-2.5 py-1 text-xs font-medium whitespace-nowrap text-popover-foreground shadow-lg ring-1 ring-foreground/10 backdrop-blur-2xl">
            {action.label}
          </motion.span>
        )}
      </AnimatePresence>
      <div className={cn("grid size-full place-items-center rounded-[26%] bg-gradient-to-b text-white",
        "shadow-[inset_0_1px_0_oklch(1_0_0/45%),inset_0_-1px_0_oklch(0_0_0/15%),0_4px_10px_-2px_oklch(0_0_0/35%)]", action.tint)}>
        <action.icon className="size-[48%] drop-shadow-[0_1px_1px_oklch(0_0_0/25%)]" strokeWidth={1.9} />
        {/* Mặt kính cong: vệt sáng phủ nửa trên biểu tượng. */}
        <span className="pointer-events-none absolute inset-x-[8%] top-[4%] h-[45%] rounded-t-[22%] rounded-b-[50%] bg-gradient-to-b from-white/35 to-transparent" />
      </div>
      {!!action.badge && (
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                     className="absolute -top-1 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white shadow-md ring-2 ring-white/40">
          {action.badge > 99 ? "99+" : action.badge}
        </motion.span>
      )}
      <span className={cn("absolute -bottom-[7px] left-1/2 size-1 -translate-x-1/2 rounded-full bg-foreground/70 transition-opacity duration-300",
        active ? "opacity-100" : "opacity-0")} />
    </motion.div>
  );

  if (action.href) {
    return <Link href={action.href} aria-label={action.label} onClick={bounce}>{icon}</Link>;
  }
  return <button type="button" aria-label={action.label} onClick={() => { bounce(); action.onClick?.(); }}>{icon}</button>;
}

function MobileTab({ action }: { action: DockAction }) {
  const pathname = usePathname();
  const active = action.href ? isActive(action.href, pathname) : false;
  const content = (
    <motion.span whileTap={{ scale: 0.88 }}
                 className={cn("relative flex min-w-11 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[10px] font-medium",
                   active ? "text-primary" : "text-muted-foreground")}>
      {active && <motion.span layoutId="mobile-tab" className="absolute inset-0 rounded-2xl bg-(--glass-strong)" />}
      <action.icon className="relative size-5" />
      <span className="relative hidden max-w-16 truncate sm:block">{action.label}</span>
      {!!action.badge && <span className="absolute top-0.5 right-2.5 size-2 rounded-full bg-red-500" />}
    </motion.span>
  );
  return action.href
    ? <Link href={action.href} aria-label={action.label}>{content}</Link>
    : <button type="button" aria-label={action.label} onClick={action.onClick}>{content}</button>;
}
