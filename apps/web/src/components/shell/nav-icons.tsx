import type { SVGProps } from "react";

const base = {
  width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
};
type P = SVGProps<SVGSVGElement>;

export const NAV_ICONS = {
  home: (p: P) => <svg {...base} {...p}><path d="M3 10.5 12 3l9 7.5V21H3z" /><path d="M9 21v-6h6v6" /></svg>,
  bell: (p: P) => <svg {...base} {...p}><path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z" /><path d="M10 21h4" /></svg>,
  box: (p: P) => <svg {...base} {...p}><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>,
  tag: (p: P) => <svg {...base} {...p}><path d="M3 12V3h9l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>,
  calendar: (p: P) => <svg {...base} {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>,
  sliders: (p: P) => <svg {...base} {...p}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>,
  clipboard: (p: P) => <svg {...base} {...p}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9zM9 12l2 2 4-4" /></svg>,
  transfer: (p: P) => <svg {...base} {...p}><path d="M4 7h13l-3-3M20 17H7l3 3" /></svg>,
  cart: (p: P) => <svg {...base} {...p}><path d="M3 4h2l2.5 11h11L21 7H6.2" /><circle cx="9" cy="19.5" r="1.5" /><circle cx="17" cy="19.5" r="1.5" /></svg>,
  truck: (p: P) => <svg {...base} {...p}><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>,
  users: (p: P) => <svg {...base} {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></svg>,
  refresh: (p: P) => <svg {...base} {...p}><path d="M20 11a8 8 0 0 0-14.9-4M4 4v4h4M4 13a8 8 0 0 0 14.9 4M20 20v-4h-4" /></svg>,
  rate: (p: P) => <svg {...base} {...p}><path d="M4 17 9 11l4 4 7-8" /><path d="M15 7h5v5" /></svg>,
  branch: (p: P) => <svg {...base} {...p}><path d="M3 9h18l-1.5-5h-15z" /><path d="M4 9v11h16V9M9 20v-6h6v6" /></svg>,
  building: (p: P) => <svg {...base} {...p}><path d="M4 21V5l8-2v18M12 7l8 3v11M8 9h0M8 13h0M8 17h0M16 13h0M16 17h0" /><path d="M2 21h20" /></svg>,
  log: (p: P) => <svg {...base} {...p}><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 12h7M9 16h7" /></svg>,
  scan: (p: P) => <svg {...base} {...p}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M8 9v6M11 9v6M14 9v6M17 9v6" /></svg>,
  chart: (p: P) => <svg {...base} {...p}><path d="M5 20V12M10 20V7M15 20v-9M20 20V4" /><path d="M3 20h18" /></svg>,
  card: (p: P) => <svg {...base} {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></svg>,
  menu: (p: P) => <svg {...base} {...p}><path d="M4 6h16M4 12h16M4 18h16" /></svg>,
  close: (p: P) => <svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>,
  shield: (p: P) => <svg {...base} {...p}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /></svg>,
  switch: (p: P) => <svg {...base} {...p}><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></svg>,
  logout: (p: P) => <svg {...base} {...p}><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11" /></svg>,
} as const;

export type NavIcon = keyof typeof NAV_ICONS;
