"use client";

import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { ArrowRight, ChartNoAxesCombined, LoaderCircle, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";

import { api, type User } from "@/lib/api";
import { useNow } from "@/lib/client";
import { cn } from "cn";

/** Chỉ chấp nhận đường dẫn nội bộ — chặn chuyển hướng sang trang giả mạo sau khi đăng nhập. */
function safeNext(target: string | null, user: User) {
  if (target?.startsWith("/") && !target.startsWith("//") && target !== "/login") return target;
  return user.role === "student" ? `/students/${user.student_id}` : "/";
}

function LockClock() {
  const time = useNow(1000);
  const now = time ? new Date(time) : null;

  return (
    <div className="text-on-wallpaper text-center select-none">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: now ? 1 : 0, y: 0 }} transition={{ duration: 0.6 }}
                  className="text-lg font-medium capitalize opacity-90 sm:text-xl">
        {now?.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" })}
      </motion.div>
      <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: now ? 1 : 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 120, damping: 18 }}
                  className="font-heading text-[96px] leading-none font-semibold tracking-tight tabular-nums sm:text-[132px]"
                  style={{ fontWeight: 600, letterSpacing: "-0.04em" }}>
        {now?.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) ?? "00:00"}
      </motion.div>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const shake = useAnimationControls();
  const password = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const user = await api<User>("/auth/login", {
        method: "POST",
        json: { username: data.get("username"), password: data.get("password") },
      });
      setUnlocked(true);
      // Để hiệu ứng mở khoá chạy xong rồi mới chuyển trang.
      setTimeout(() => router.replace(safeNext(params.get("next"), user)), 520);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      shake.start({ x: [0, -14, 14, -10, 10, -4, 4, 0], transition: { duration: 0.5 } });
      if (password.current) {
        password.current.value = "";
        password.current.focus();
      }
    }
  }

  return (
    <motion.div className="flex min-h-dvh flex-col items-center justify-between px-6 pt-[9vh] pb-10"
                animate={unlocked ? { opacity: 0, scale: 1.08, filter: "blur(18px)" } : { opacity: 1, scale: 1, filter: "blur(0px)" }}
                transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}>
      <LockClock />

      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 160, damping: 20, delay: 0.2 }}
                  className="w-full max-w-xs">
        <motion.form onSubmit={submit} animate={shake} className="flex w-full flex-col items-center gap-3">
          <motion.div whileHover={{ scale: 1.04 }}
                      className="glass rim mb-1 grid size-24 place-items-center rounded-full text-white">
            <AnimatePresence mode="wait">
              {username ? (
                <motion.span key="letter" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}
                             className="text-4xl font-semibold uppercase">{username[0]}</motion.span>
              ) : (
                <motion.span key="icon" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}>
                  <UserRound className="size-11" strokeWidth={1.5} />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>

          <label htmlFor="username" className="sr-only">Tên đăng nhập</label>
          <input id="username" name="username" autoComplete="username" autoFocus required placeholder="Tên đăng nhập"
                 value={username} onChange={(e) => setUsername(e.target.value)}
                 className="glass rim h-10 w-full rounded-full px-5 text-center text-[15px] text-white outline-none placeholder:text-white/65 focus:ring-3 focus:ring-white/35" />

          <div className="relative w-full">
            <label htmlFor="password" className="sr-only">Mật khẩu</label>
            <input ref={password} id="password" name="password" type="password" autoComplete="current-password" required
                   placeholder="Nhập mật khẩu"
                   className="glass rim h-10 w-full rounded-full pr-12 pl-5 text-center text-[15px] text-white outline-none placeholder:text-white/65 focus:ring-3 focus:ring-white/35" />
            <motion.button type="submit" disabled={busy} aria-label="Đăng nhập" whileTap={{ scale: 0.85 }}
                           className={cn("absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-white/30 text-white transition-colors hover:bg-white/45",
                             busy && "bg-white/20")}>
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" strokeWidth={2.5} />}
            </motion.button>
          </div>

          <div className="h-6">
            <AnimatePresence>
              {error && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          className="text-on-wallpaper text-center text-sm font-medium">
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </motion.form>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                  className="text-on-wallpaper flex items-center gap-2 text-sm opacity-85">
        <ChartNoAxesCombined className="size-4" />
        <span className="font-semibold">EduGuard AI</span>
        <span className="opacity-70">· Phát hiện sớm, can thiệp kịp thời</span>
      </motion.div>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <div className="h-dvh overflow-y-auto">
      <Suspense><LoginForm /></Suspense>
    </div>
  );
}
