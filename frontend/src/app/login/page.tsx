"use client";

import { motion } from "framer-motion";
import { BellRing, ChartNoAxesCombined, Lightbulb, LineChart, LoaderCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type User } from "@/lib/api";

const HIGHLIGHTS = [
  { icon: BellRing, title: "Cảnh báo sớm", text: "Biết ngay sinh viên nào đang xấu đi nhanh hoặc chưa ai hỗ trợ." },
  { icon: LineChart, title: "Hiểu nguyên nhân", text: "Mỗi dự đoán kèm yếu tố đã đẩy nguy cơ lên hay kéo xuống." },
  { icon: Lightbulb, title: "Biết nên làm gì", text: "Gợi ý can thiệp và mô phỏng hiệu quả trước khi hành động." },
];

/** Chỉ chấp nhận đường dẫn nội bộ — chặn chuyển hướng sang trang giả mạo sau khi đăng nhập. */
function safeNext(target: string | null, user: User) {
  if (target?.startsWith("/") && !target.startsWith("//") && target !== "/login") return target;
  return user.role === "student" ? `/students/${user.student_id}` : "/";
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      router.replace(safeNext(params.get("next"), user));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="username">Tên đăng nhập</Label>
        <Input id="username" name="username" autoComplete="username" autoFocus required className="h-10" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Mật khẩu</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-10" />
      </div>
      {error && (
        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </motion.p>
      )}
      <Button type="submit" className="h-10 w-full" disabled={busy}>
        {busy && <LoaderCircle className="animate-spin" />} Đăng nhập
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col">
        {/* Hai quầng sáng mờ chuyển động chậm — tạo chiều sâu mà không kéo sự chú ý khỏi nội dung. */}
        <motion.div className="absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl"
                    animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 8, repeat: Infinity }} />
        <motion.div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-white/10 blur-3xl"
                    animate={{ scale: [1.1, 1, 1.1] }} transition={{ duration: 10, repeat: Infinity }} />

        <div className="relative flex items-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-xl bg-white/15"><ChartNoAxesCombined /></div>
          <span className="text-lg font-semibold">EduGuard AI</span>
        </div>

        <div className="relative mt-auto max-w-md">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            Phát hiện sớm, can thiệp kịp thời.
          </h1>
          <p className="mt-3 text-primary-foreground/80">
            Hệ thống giúp cố vấn học tập biết sinh viên nào cần được quan tâm — và vì sao.
          </p>
          <div className="mt-10 space-y-5">
            {HIGHLIGHTS.map((item, i) => (
              <motion.div key={item.title} className="flex gap-3"
                          initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 + i * 0.12 }}>
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/15">
                  <item.icon className="size-4" />
                </div>
                <div>
                  <div className="font-medium">{item.title}</div>
                  <div className="text-sm text-primary-foreground/75">{item.text}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight">Đăng nhập</h2>
          <p className="mb-8 mt-1 text-sm text-muted-foreground">Dùng tài khoản được nhà trường cấp.</p>
          <Suspense><LoginForm /></Suspense>
        </div>
      </div>
    </div>
  );
}
