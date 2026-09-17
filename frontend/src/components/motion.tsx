"use client";

import { motion, type HTMLMotionProps } from "framer-motion";

/**
 * Hiệu ứng xuất hiện dùng chung. Giữ ngắn và nhẹ (dưới 0,4 giây, dịch 8px): chuyển
 * động ở đây để mắt người dùng biết nội dung nào vừa đổi, không phải để trang trí.
 */
export function FadeIn({ delay = 0, ...props }: HTMLMotionProps<"div"> & { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
      {...props}
    />
  );
}

/** Các phần tử con xuất hiện nối tiếp nhau — dùng cho lưới thẻ số liệu. */
export function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.06 } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem(props: HTMLMotionProps<"div">) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}
      {...props}
    />
  );
}
