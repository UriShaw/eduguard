"use client";

import { useSyncExternalStore } from "react";

const never = () => () => {};

/**
 * Giá trị chỉ có ở trình duyệt (giờ địa phương, hệ điều hành…). Máy chủ render bằng
 * `server`, trình duyệt thay bằng giá trị thật ngay khi hydrate mà không lệch HTML.
 * `client` phải trả về cùng một giá trị giữa các lần gọi (chuỗi, số, hoặc đối tượng đã cache).
 */
export function useClientValue<T>(client: () => T, server: T): T {
  return useSyncExternalStore(never, client, () => server);
}

/**
 * Thời điểm hiện tại, làm tròn theo `step` mili giây và tự cập nhật sau mỗi bước.
 * Trả về 0 khi render ở máy chủ.
 */
export function useNow(step: number): number {
  return useSyncExternalStore(
    (notify) => {
      const timer = setInterval(notify, Math.min(step, 1000));
      return () => clearInterval(timer);
    },
    () => Math.floor(Date.now() / step) * step,
    () => 0,
  );
}
