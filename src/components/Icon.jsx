// SF Symbols–style line icons (original drawings, 24×24 grid).
const P = {
  truck: <><path d="M2.5 16.5V7a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 14.5 7v9.5" /><path d="M14.5 10h3.6l3.4 4v2.5h-1.6" /><path d="M2.5 16.5h1.6M9.4 16.5h5.2" /><circle cx="6.8" cy="17" r="2" /><circle cx="17.6" cy="17" r="2" /></>,
  box: <><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" /><path d="m7.8 5.3 8.4 4.5" /></>,
  map: <><path d="m9 4-5.5 2v14L9 18l6 2 5.5-2V4L15 6z" /><path d="M9 4v14M15 6v14" /></>,
  pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  plusCircle: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>,
  doc: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" /></>,
  person: <><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5c.8-4 3.8-6 7.5-6s6.7 2 7.5 6" /></>,
  people: <><circle cx="9" cy="8.5" r="3.3" /><path d="M2.8 19.5c.7-3.4 3.2-5.2 6.2-5.2s5.5 1.8 6.2 5.2" /><path d="M15.5 5.6a3.2 3.2 0 0 1 0 6M17.5 14.6c2 .6 3.3 2.2 3.7 4.9" /></>,
  fuel: <><path d="M4.5 20.5V5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 14.5 5v15.5M3 20.5h13" /><path d="M7 7.5h5v4H7z" /><path d="M14.5 9h2a1.5 1.5 0 0 1 1.5 1.5v6a1.3 1.3 0 0 0 2.6 0V8.3L18 5.6" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  camera: <><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.8l1.6-2.5h6.2L16.7 7h2.8A1.5 1.5 0 0 1 21 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" /><circle cx="12" cy="13.2" r="3.8" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12.3 2.8 2.8L16.3 9.5" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  chevronLeft: <path d="m15 5-7 7 7 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  phone: <path d="M5 3.5h3.2l1.6 4.2-2 1.3a11 11 0 0 0 5.2 5.2l1.3-2 4.2 1.6V17a2 2 0 0 1-2 2A15.5 15.5 0 0 1 3 5.5a2 2 0 0 1 2-2z" />,
  message: <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z" />,
  send: <path d="M4 12 20 4l-5 16-3.2-6.8z M11.8 13.2 20 4" />,
  bolt: <path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z" />,
  flag: <><path d="M5 21V4" /><path d="M5 4.5h11l-2 4 2 4H5" /></>,
  warning: <><path d="M12 3.5 2.5 20h19z" /><path d="M12 10v4.5M12 17.3v.2" /></>,
  shield: <><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z" /><path d="m8.8 12 2.3 2.3 4.3-4.6" /></>,
  route: <><circle cx="6" cy="18" r="2.4" /><circle cx="18" cy="6" r="2.4" /><path d="M8.4 18H16a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h7.6" /></>,
  location: <path d="M20.5 3.5 3.5 10.6l7.2 2.7 2.7 7.2z" />,
  star: <path d="m12 3.5 2.6 5.5 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.1 6-.7z" />,
  dollar: <><circle cx="12" cy="12" r="9" /><path d="M14.8 9.2c-.4-1-1.5-1.7-2.8-1.7-1.6 0-2.8.9-2.8 2.2 0 3.1 5.8 1.6 5.8 4.6 0 1.3-1.3 2.2-3 2.2-1.4 0-2.6-.7-3-1.8M12 6v1.5M12 16.5V18" /></>,
  speedo: <><path d="M3.5 16a8.5 8.5 0 1 1 17 0" /><path d="m12 16 4-5" /><circle cx="12" cy="16" r="1.2" /></>,
  wrench: <path d="M14.5 4.2a4.5 4.5 0 0 0-5.4 6l-6 6a1.8 1.8 0 0 0 2.6 2.6l6-6a4.5 4.5 0 0 0 6-5.4l-2.6 2.6-2.6-.6-.6-2.6z" />,
  signature: <><path d="M3 17c2-1 3.5-6 5.5-6s.5 5 2.5 5 2-3 3.5-3 1 2 2.5 2 2.5-1 4-2" /><path d="M3 20.5h18" /></>,
  thermometer: <><path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z" /><path d="M12 9v8" /></>,
  weight: <><path d="M6.5 8h11l2.5 12.5H4z" /><circle cx="12" cy="5.5" r="2.3" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>,
  navigate: <path d="M12 2.5 19 20l-7-3.5L5 20z" />,
  refresh: <><path d="M20 11a8 8 0 0 0-14.3-4.6L4 8" /><path d="M4 3.5V8h4.5M4 13a8 8 0 0 0 14.3 4.6L20 16" /><path d="M20 20.5V16h-4.5" /></>,
  logout: <><path d="M14 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h8" /><path d="M10 12h10.5M17 8.5l3.5 3.5-3.5 3.5" /></>,
  textsize: <><path d="M3 18 8 6l5 12M4.8 14h6.4" /><path d="M14 18l3.5-8.5L21 18M15.2 15.3h4.6" /></>,
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  building: <><path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V21M15 9.5h3.5A1.5 1.5 0 0 1 20 11v10M2.5 21h19" /><path d="M8 8h3M8 12h3M8 16h3" /></>,
  receipt: <><path d="M5.5 3h13v18l-2.2-1.5L14 21l-2-1.5L10 21l-2.3-1.5L5.5 21z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  sparkles: <><path d="M10 3.5 11.6 8 16 9.5 11.6 11 10 15.5 8.4 11 4 9.5 8.4 8z" /><path d="M17.5 13.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" /></>,
  trash: <><path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13.5h9l1-13.5" /></>,
  print: <><path d="M7 8V3.5h10V8M7 17H4.5V9.5A1.5 1.5 0 0 1 6 8h12a1.5 1.5 0 0 1 1.5 1.5V17H17" /><path d="M7 13.5h10v7H7z" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  wifi: <><path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.3a9.5 9.5 0 0 1 13 0M8.6 15.5a5 5 0 0 1 6.8 0" /><circle cx="12" cy="18.8" r="1" /></>,
};

export default function Icon({ name, size = 22, stroke = 1.8, fill = 'none', style, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" style={style} className={className} aria-hidden="true">
      {P[name] || P.box}
    </svg>
  );
}
