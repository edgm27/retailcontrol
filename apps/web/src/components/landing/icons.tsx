import type { SVGProps } from "react";

const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const IconBox = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>
);
export const IconStore = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M3 9h18l-1.5-5h-15L3 9Z" /><path d="M4 9v11h16V9" /><path d="M9 20v-6h6v6" /><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /></svg>
);
export const IconChart = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M5 20V12M10 20V7M15 20v-9M20 20V4" /><path d="M3 20h18" /></svg>
);
export const IconShield = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>
);
export const IconCalendar = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="m9 15 2 2 4-4" /></svg>
);
export const IconArrowRight = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IconChevron = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="m6 9 6 6 6-6" /></svg>
);
export const IconCheckCircle = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>
);
export const IconPlay = (p: SVGProps<SVGSVGElement>) => (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}><path d="M7 4.5v15l13-7.5-13-7.5Z" /></svg>
);
export const IconMouse = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><rect x="7" y="3" width="10" height="18" rx="5" /><path d="M12 7v3" /></svg>
);
export const IconTransfer = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M4 7h13l-3-3M20 17H7l3 3" /></svg>
);
export const IconUsers = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></svg>
);
export const IconScan = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M8 9v6M11 9v6M14 9v6M17 9v6" /></svg>
);
export const IconLog = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 12h7M9 16h7" /></svg>
);

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <svg width={compact ? 28 : 34} height={compact ? 28 : 34} viewBox="0 0 34 34" aria-hidden>
        <defs>
          <linearGradient id="rc-g" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#1fb7d6" />
            <stop offset="1" stopColor="#3ef0e4" />
          </linearGradient>
        </defs>
        <rect x="2" y="20" width="7" height="12" rx="1.5" fill="url(#rc-g)" />
        <rect x="12" y="12" width="7" height="20" rx="1.5" fill="url(#rc-g)" />
        <rect x="22" y="3" width="7" height="29" rx="1.5" fill="url(#rc-g)" />
        <rect x="2" y="11" width="7" height="6" rx="1.5" fill="#3ef0e4" opacity=".55" />
      </svg>
      <span className="flex flex-col leading-none">
        <span className={`${compact ? "text-[1.3rem]" : "text-[1.6rem]"} font-bold tracking-tight`}>
          <span className="text-white">Retail</span>
          <span className="text-[#2ee6e0]">Control</span>
        </span>
        <span className="mt-1 text-[0.72rem] font-medium text-white/80">por Rumbo Digital</span>
      </span>
    </span>
  );
}
