"use client";

import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "next-themes";
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

/**
 * Tuỳ chọn hiển thị của từng người xem: hình nền, chuyển động, hiệu ứng khúc xạ.
 *
 * Lưu ở localStorage vì đây là thói quen của một trình duyệt, không phải dữ liệu
 * nghiệp vụ. Mọi lần đọc/ghi đều bọc try/catch: trình duyệt ẩn danh hoặc chặn
 * lưu trữ vẫn phải hiển thị được với giá trị mặc định.
 */

export const WALLPAPERS = [
  { id: "sequoia", name: "Sequoia", preview: "linear-gradient(160deg,#1d3b8a,#4b2f9c 45%,#0f5c9e)" },
  { id: "sunset", name: "Hoàng hôn", preview: "linear-gradient(160deg,#7c2d5a,#e0583c 50%,#f5a340)" },
  { id: "lagoon", name: "Đầm phá", preview: "linear-gradient(160deg,#064e57,#0f766e 45%,#1e40af)" },
  { id: "aurora", name: "Cực quang", preview: "linear-gradient(160deg,#052e2b,#134e4a 40%,#312e81)" },
  { id: "graphite", name: "Than chì", preview: "linear-gradient(160deg,#3f4652,#1f2530 55%,#4b5563)" },
] as const;

export type WallpaperId = (typeof WALLPAPERS)[number]["id"];

interface Preferences {
  wallpaper: WallpaperId;
  reduceMotion: boolean;
  liquidLens: boolean;
  dockMagnify: boolean;
}

const DEFAULTS: Preferences = { wallpaper: "sequoia", reduceMotion: false, liquidLens: true, dockMagnify: true };
const KEY = "eduguard.preferences";

const PreferencesContext = createContext<{
  prefs: Preferences;
  update: (patch: Partial<Preferences>) => void;
} | null>(null);

let cached: Preferences | null = null;
const listeners = new Set<() => void>();

function snapshot(): Preferences {
  if (!cached) {
    try {
      cached = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
    } catch {
      cached = DEFAULTS;
    }
  }
  return cached!;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(patch: Partial<Preferences>) {
  cached = { ...snapshot(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    // Không lưu được thì vẫn áp dụng cho phiên hiện tại.
  }
  listeners.forEach((listener) => listener());
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Máy chủ không có localStorage nên render bằng mặc định; trình duyệt đọc giá trị thật khi hydrate.
  const prefs = useSyncExternalStore(subscribe, snapshot, () => DEFAULTS);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.wallpaper = prefs.wallpaper;
    const systemReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.dataset.motion = prefs.reduceMotion || systemReduced ? "reduced" : "full";
    // Bộ lọc SVG trong backdrop-filter chỉ Chromium hiển thị đúng; nơi khác giữ lớp mờ thường.
    const chromium = /Chrome\//.test(navigator.userAgent);
    root.dataset.lens = prefs.liquidLens && chromium ? "on" : "off";
  }, [prefs]);

  const value = useMemo(() => ({ prefs, update }), [prefs]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PreferencesContext.Provider value={value}>
        <MotionConfig reducedMotion={prefs.reduceMotion ? "always" : "user"}>{children}</MotionConfig>
      </PreferencesContext.Provider>
    </ThemeProvider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("usePreferences phải được dùng bên trong Providers");
  return context;
}
