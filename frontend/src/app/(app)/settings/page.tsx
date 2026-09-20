"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Check, ChevronRight, Cpu, Info, Keyboard, KeyRound, Lock, Magnet, Monitor, Moon, Palette, Sparkles, Sun, UserRound, Waves,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { useShell } from "@/components/app-shell";
import { Field, PasswordInput } from "@/components/dialogs";
import { GroupedList, GroupedRow, Kbd, Monogram, SOFT_SPRING, SPRING } from "@/components/mac/controls";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api, ROLE_LABELS, useApi } from "@/lib/api";
import { useClientValue } from "@/lib/client";
import { navigation, useModifierKeys } from "@/lib/navigation";
import { usePreferences, WALLPAPERS } from "@/lib/preferences";
import { cn } from "cn";

type Pane = "account" | "appearance" | "shortcuts" | "about";

const PANES: { id: Pane; label: string; icon: React.ElementType; tint: string }[] = [
  { id: "account", label: "Tài khoản", icon: UserRound, tint: "from-sky-400 to-blue-600" },
  { id: "appearance", label: "Giao diện", icon: Palette, tint: "from-fuchsia-400 to-purple-600" },
  { id: "shortcuts", label: "Phím tắt", icon: Keyboard, tint: "from-zinc-400 to-zinc-600" },
  { id: "about", label: "Giới thiệu", icon: Info, tint: "from-slate-400 to-slate-600" },
];

function Settings() {
  const params = useSearchParams();
  const router = useRouter();
  const initial = PANES.find((p) => p.id === params.get("tab"))?.id ?? "account";
  const [pane, setPane] = useState<Pane>(initial);

  const select = (id: Pane) => {
    setPane(id);
    router.replace(`/settings?tab=${id}`, { scroll: false });
  };

  return (
    <div className="grid gap-6 pt-2 md:grid-cols-[220px_1fr]">
      <nav className="space-y-0.5 md:sticky md:top-2 md:self-start">
        <h1 className="mb-3 px-2 font-heading text-[28px] font-bold tracking-tight">Cài đặt</h1>
        {PANES.map((p) => (
          <button key={p.id} type="button" onClick={() => select(p.id)}
                  className={cn("relative flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2 text-left text-sm transition-colors",
                    pane === p.id ? "text-primary-foreground" : "hover:bg-muted")}>
            {pane === p.id && <motion.span layoutId="settings-pane" transition={SPRING} className="absolute inset-0 rounded-[10px] bg-primary" />}
            <span className={cn("relative grid size-6 place-items-center rounded-[7px] bg-gradient-to-b text-white", p.tint)}><p.icon className="size-3.5" /></span>
            <span className="relative flex-1">{p.label}</span>
            <ChevronRight className="relative size-4 opacity-40 md:hidden" />
          </button>
        ))}
      </nav>

      <AnimatePresence mode="wait">
        <motion.section key={pane} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
                        transition={SOFT_SPRING} className="min-w-0 space-y-6 md:pt-14">
          {pane === "account" && <AccountPane />}
          {pane === "appearance" && <AppearancePane />}
          {pane === "shortcuts" && <ShortcutsPane />}
          {pane === "about" && <AboutPane />}
        </motion.section>
      </AnimatePresence>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 px-1 text-[13px] font-semibold text-muted-foreground">{children}</h2>;
}

function AccountPane() {
  const { user, lock } = useShell();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function change(event: React.FormEvent) {
    event.preventDefault();
    if (next !== confirm) {
      toast.error("Hai lần nhập mật khẩu mới không khớp.");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/password", { method: "POST", json: { current_password: current, new_password: next } });
      toast.success("Đã đổi mật khẩu", { description: "Dùng mật khẩu mới cho lần đăng nhập sau." });
      setCurrent(""); setNext(""); setConfirm("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <motion.div initial={{ scale: 0.7 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 14 }}>
          <Monogram name={user.full_name} className="size-24 text-4xl" />
        </motion.div>
        <div className="font-heading text-2xl font-semibold">{user.full_name}</div>
        <div className="text-sm text-muted-foreground">@{user.username} · {ROLE_LABELS[user.role]}</div>
      </div>

      <div>
        <SectionTitle>Mật khẩu</SectionTitle>
        <form onSubmit={change} className="space-y-4 rounded-[18px] bg-card p-5 ring-1 ring-foreground/[0.07] dark:ring-white/10">
          <Field label="Mật khẩu hiện tại"><PasswordInput required value={current} onChange={setCurrent} autoComplete="current-password" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mật khẩu mới" hint="Ít nhất 6 ký tự."><PasswordInput required value={next} onChange={setNext} /></Field>
            <Field label="Nhập lại mật khẩu mới"><PasswordInput required value={confirm} onChange={setConfirm} /></Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}><KeyRound /> Đổi mật khẩu</Button>
          </div>
        </form>
      </div>

      <div>
        <SectionTitle>Phiên đăng nhập</SectionTitle>
        <GroupedList>
          <GroupedRow icon={Lock} tint="from-zinc-500 to-zinc-800" title="Khoá màn hình" description="Đăng xuất khỏi trình duyệt này.">
            <Button variant="outline" size="sm" onClick={lock}>Khoá</Button>
          </GroupedRow>
        </GroupedList>
      </div>
    </>
  );
}

function AppearancePane() {
  const { theme, setTheme } = useTheme();
  const { prefs, update } = usePreferences();
  // Theme chỉ biết được ở trình duyệt; trước đó không đánh dấu lựa chọn nào để tránh nhấp nháy sai.
  const mounted = useClientValue(() => true, false);

  const themes = [
    { id: "light", label: "Sáng", icon: Sun, preview: "bg-[linear-gradient(135deg,#f8fafc,#e2e8f0)]" },
    { id: "dark", label: "Tối", icon: Moon, preview: "bg-[linear-gradient(135deg,#1e293b,#0f172a)]" },
    { id: "system", label: "Tự động", icon: Monitor, preview: "bg-[linear-gradient(135deg,#f8fafc_50%,#0f172a_50%)]" },
  ];

  return (
    <>
      <div>
        <SectionTitle>Chế độ</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          {themes.map((t) => {
            const active = mounted && theme === t.id;
            return (
              <button key={t.id} type="button" onClick={() => setTheme(t.id)} className="group flex flex-col items-center gap-2">
                <motion.span whileHover={{ y: -3 }} whileTap={{ scale: 0.96 }} transition={SOFT_SPRING}
                             className={cn("relative block aspect-[4/3] w-full overflow-hidden rounded-2xl shadow-md ring-2 ring-offset-2 ring-offset-transparent transition-shadow",
                               t.preview, active ? "ring-primary" : "ring-transparent")}>
                  <span className="absolute inset-x-[12%] top-[14%] h-[14%] rounded-md bg-white/50 backdrop-blur" />
                  <span className="absolute top-[36%] left-[12%] h-[50%] w-[28%] rounded-md bg-white/40" />
                  <span className="absolute top-[36%] right-[12%] h-[50%] w-[48%] rounded-md bg-white/25" />
                </motion.span>
                <span className={cn("flex items-center gap-1 text-sm", active && "font-semibold text-primary")}>
                  <t.icon className="size-3.5" />{t.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <SectionTitle>Hình nền</SectionTitle>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {WALLPAPERS.map((wp) => (
            <button key={wp.id} type="button" onClick={() => update({ wallpaper: wp.id })} className="flex flex-col items-center gap-1.5">
              <motion.span whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} transition={SOFT_SPRING}
                           className={cn("relative grid aspect-video w-full place-items-center rounded-xl shadow-md ring-2 ring-offset-2 ring-offset-transparent",
                             prefs.wallpaper === wp.id ? "ring-primary" : "ring-transparent")}
                           style={{ background: wp.preview }}>
                {prefs.wallpaper === wp.id && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={SPRING}
                               className="grid size-6 place-items-center rounded-full bg-white/90 text-primary shadow"><Check className="size-4" strokeWidth={3} /></motion.span>
                )}
              </motion.span>
              <span className="text-xs">{wp.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle>Hiệu ứng</SectionTitle>
        <GroupedList>
          <GroupedRow icon={Waves} tint="from-cyan-400 to-sky-600" title="Khúc xạ kính lỏng"
                      description="Nền phía sau Dock và Spotlight bị bẻ cong như nhìn qua kính. Cần Chrome, Edge hoặc Opera.">
            <Switch checked={prefs.liquidLens} onCheckedChange={(v) => update({ liquidLens: v })} />
          </GroupedRow>
          <GroupedRow icon={Magnet} tint="from-orange-300 to-orange-600" title="Phóng to biểu tượng Dock" description="Biểu tượng to dần khi rê chuột qua.">
            <Switch checked={prefs.dockMagnify} onCheckedChange={(v) => update({ dockMagnify: v })} />
          </GroupedRow>
          <GroupedRow icon={Sparkles} tint="from-violet-400 to-purple-600" title="Giảm chuyển động"
                      description="Tắt hình nền trôi và rút ngắn hoạt ảnh. Tự bật nếu hệ điều hành yêu cầu.">
            <Switch checked={prefs.reduceMotion} onCheckedChange={(v) => update({ reduceMotion: v })} />
          </GroupedRow>
        </GroupedList>
      </div>
    </>
  );
}

function ShortcutsPane() {
  const { user } = useShell();
  const keys = useModifierKeys();

  const groups: { title: string; rows: [string, string][] }[] = [
    { title: "Chung", rows: [[`${keys.mod}K`, "Spotlight — tìm sinh viên, trang, thao tác"], [`${keys.alt}N`, "Trung tâm thông báo"],
                             [`${keys.alt}L`, "Khoá màn hình"]] },
    { title: "Cửa sổ", rows: [[`${keys.alt}S`, "Ẩn/hiện thanh bên"], [`${keys.alt}M`, "Toàn màn hình"]] },
    { title: "Đi tới", rows: navigation(user).map((i) => [`${keys.alt}${i.key}`, i.label] as [string, string]) },
    { title: "Danh sách sinh viên", rows: [["↑ ↓", "Chọn dòng"], ["Space", "Xem nhanh"], ["↵", "Mở hồ sơ"], ["⌫", "Xoá (quản trị viên)"]] },
  ];

  return groups.map((group) => (
    <div key={group.title}>
      <SectionTitle>{group.title}</SectionTitle>
      <GroupedList>
        {group.rows.map(([key, label]) => (
          <GroupedRow key={label} title={label}><Kbd className="h-6 px-2 text-xs">{key}</Kbd></GroupedRow>
        ))}
      </GroupedList>
    </div>
  ));
}

function AboutPane() {
  const { user } = useShell();
  const { data: model } = useApi<{ name: string; version: string; trained_at: string; metrics: Record<string, number> }>(
    user.role !== "student" ? "/model" : null,
  );

  return (
    <>
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <motion.div initial={{ rotate: -20, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 12 }}
                    className="grid size-24 place-items-center rounded-[26px] bg-gradient-to-b from-sky-400 to-indigo-600 text-white shadow-2xl shadow-indigo-500/40">
          <Cpu className="size-12" strokeWidth={1.5} />
        </motion.div>
        <div className="font-heading text-3xl font-bold tracking-tight">EduGuard AI</div>
        <div className="text-sm text-muted-foreground">Phiên bản 2.0 · Dự đoán và cảnh báo sớm nguy cơ bỏ học</div>
      </div>
      {model && (
        <div>
          <SectionTitle>Model đang dùng</SectionTitle>
          <GroupedList>
            <GroupedRow title="Thuật toán"><span className="text-sm text-muted-foreground">{model.name}</span></GroupedRow>
            <GroupedRow title="Phiên bản"><span className="font-mono text-xs text-muted-foreground">{model.version}</span></GroupedRow>
            <GroupedRow title="Huấn luyện"><span className="text-sm text-muted-foreground">{new Date(model.trained_at).toLocaleString("vi-VN")}</span></GroupedRow>
            {(["recall", "precision", "roc_auc", "accuracy"] as const).filter((k) => model.metrics[k] != null).map((k) => (
              <GroupedRow key={k} title={k === "roc_auc" ? "ROC-AUC" : k[0].toUpperCase() + k.slice(1)}>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                    <motion.span className="block h-full rounded-full bg-primary" initial={{ width: 0 }}
                                 animate={{ width: `${model.metrics[k] * 100}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
                  </span>
                  <span className="w-10 text-right text-sm tabular-nums">{model.metrics[k].toFixed(2)}</span>
                </span>
              </GroupedRow>
            ))}
          </GroupedList>
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            Recall là tỷ lệ sinh viên thực sự có nguy cơ được model phát hiện. Kết quả dự đoán là căn cứ để bắt đầu trò chuyện, không phải phán quyết.
          </p>
        </div>
      )}
    </>
  );
}

export default function SettingsPage() {
  return <Suspense><Settings /></Suspense>;
}
