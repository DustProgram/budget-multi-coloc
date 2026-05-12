interface IconProps {
  size?: number;
  stroke?: number;
}

const Icon = ({ d, size = 16, stroke = 1.75 }: { d: string | string[]; size?: number; stroke?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

export const Icons = {
  dashboard: (p: IconProps) => <Icon {...p} d={["M3 13h8V3H3z","M13 21h8V11h-8z","M3 21h8v-6H3z","M13 9h8V3h-8z"]} />,
  calendar: (p: IconProps) => <Icon {...p} d={["M8 2v4","M16 2v4","M3 9h18","M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"]} />,
  wallet: (p: IconProps) => <Icon {...p} d={["M20 12V8H4a2 2 0 0 1 0-4h12v4","M20 12v8H4a2 2 0 0 1-2-2V6","M18 12a2 2 0 0 0 0 4h4v-4z"]} />,
  trending: (p: IconProps) => <Icon {...p} d={["M22 7l-9.5 9.5-5-5L1 18","M16 7h6v6"]} />,
  receipt: (p: IconProps) => <Icon {...p} d={["M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z","M8 7h8","M8 11h8","M8 15h5"]} />,
  swap: (p: IconProps) => <Icon {...p} d={["M17 3l4 4-4 4","M3 7h18","M7 21l-4-4 4-4","M21 17H3"]} />,
  piggy: (p: IconProps) => <Icon {...p} d={["M19 5c-1.5 0-3 1.5-3 3v.5a3 3 0 0 0-2 .5h-1c-3 0-5 2-5 5v3l-2 1v2h4l1-1h6l1 1h4v-7c0-1-.5-2-1-2.5C21 9.5 22 7.5 21 6c-.5-.5-1-1-2-1z","M18 11h.01"]} />,
  cart: (p: IconProps) => <Icon {...p} d={["M2 2h2.5l2 12.5a2 2 0 0 0 2 1.5h9a2 2 0 0 0 2-1.5L21 6H6","M9 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2z","M18 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"]} />,
  calc: (p: IconProps) => <Icon {...p} d={["M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z","M8 6h8","M8 10h2","M14 10h2","M8 14h2","M14 14h2","M8 18h2","M14 18h2"]} />,
  chart: (p: IconProps) => <Icon {...p} d={["M3 3v18h18","M7 17v-5","M12 17V9","M17 17V6"]} />,
  list: (p: IconProps) => <Icon {...p} d={["M8 6h13","M8 12h13","M8 18h13","M3 6h.01","M3 12h.01","M3 18h.01"]} />,
  users: (p: IconProps) => <Icon {...p} d={["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2","M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z","M22 21v-2a4 4 0 0 0-3-3.87","M16 3.13a4 4 0 0 1 0 7.75"]} />,
  chevL: (p: IconProps) => <Icon {...p} d="M15 18l-6-6 6-6" />,
  chevR: (p: IconProps) => <Icon {...p} d="M9 18l6-6-6-6" />,
  chevD: (p: IconProps) => <Icon {...p} d="M6 9l6 6 6-6" />,
  plus: (p: IconProps) => <Icon {...p} d={["M12 5v14","M5 12h14"]} />,
  check: (p: IconProps) => <Icon {...p} d="M20 6L9 17l-5-5" />,
  x: (p: IconProps) => <Icon {...p} d={["M18 6L6 18","M6 6l12 12"]} />,
  arrow: (p: IconProps) => <Icon {...p} d={["M5 12h14","M12 5l7 7-7 7"]} />,
  sliders: (p: IconProps) => <Icon {...p} d={["M4 21V14","M4 10V3","M12 21V12","M12 8V3","M20 21V16","M20 12V3","M1 14h6","M9 8h6","M17 16h6"]} />,
  menu: (p: IconProps) => <Icon {...p} d={["M3 12h18","M3 6h18","M3 18h18"]} />,
  download: (p: IconProps) => <Icon {...p} d={["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4","M7 10l5 5 5-5","M12 15V3"]} />,
  building: (p: IconProps) => <Icon {...p} d={["M3 21h18","M5 21V7l8-4v18","M19 21V11l-6-4","M9 9v.01","M9 12v.01","M9 15v.01","M9 18v.01"]} />,
};
