/**
 * Hình nền kiểu macOS: gradient nền cùng bốn quầng màu trôi rất chậm phía sau lớp kính.
 * Màu lấy từ biến --wp-* theo html[data-wallpaper], nên đổi hình nền không cần render lại.
 */
const BLOBS = [
  { color: "var(--wp-1)", className: "-left-[10%] -top-[15%] size-[55vmax]", drift: "38s" },
  { color: "var(--wp-2)", className: "-right-[15%] top-[10%] size-[50vmax]", drift: "44s" },
  { color: "var(--wp-3)", className: "-bottom-[25%] left-[15%] size-[48vmax]", drift: "52s" },
  { color: "var(--wp-4)", className: "-bottom-[10%] -right-[5%] size-[35vmax]", drift: "33s" },
];

export function Wallpaper() {
  return (
    <div aria-hidden className="wallpaper pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {BLOBS.map((blob, i) => (
        <div key={i} className={`wallpaper-blob ${blob.className}`}
             style={{ background: `radial-gradient(circle at 50% 50%, ${blob.color}, transparent 68%)`,
                      ["--drift" as string]: blob.drift, animationDelay: `${-i * 7}s` }} />
      ))}
    </div>
  );
}

/**
 * Bộ lọc khúc xạ cho lớp .liquid-lens: nhiễu mịn làm lệch điểm ảnh phía sau như
 * nhìn qua mặt kính gợn sóng. Khai báo một lần ở gốc trang.
 */
export function LiquidLensFilter() {
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      <filter id="liquid-lens" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="7" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
        <feDisplacementMap in="SourceGraphic" in2="soft" scale="38" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
