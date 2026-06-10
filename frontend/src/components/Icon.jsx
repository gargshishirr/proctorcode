// Lightweight feather-style stroke icons (no external dependency).
const paths = {
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z|||circle:12,12,3',
  monitor: 'M2 3h20v14H2zM8 21h8M12 17v4',
  clipboard: 'M9 2h6a1 1 0 011 1v1H8V3a1 1 0 011-1zM8 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2',
  clock: 'M12 6v6l4 2|||circle:12,12,10',
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2|||circle:9,7,4|||M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  file: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18M6 6l12 12',
  alert: 'M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  plus: 'M12 5v14M5 12h14',
  trash: 'M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  camera: 'M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z|||circle:12,13,4',
  edit: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  play: 'M5 3l14 9-14 9V3z',
  arrowLeft: 'M19 12H5M12 19l-7-7 7-7',
  arrowRight: 'M5 12h14M12 5l7 7-7 7',
  gauge: 'M12 12l4-4|||M3 12a9 9 0 1118 0',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  mail: 'M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zM22 6l-10 7L2 6',
  lock: 'M5 11h14v10H5zM7 11V7a5 5 0 0110 0v4|||',
  user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2|||circle:12,7,4',
  copy: 'M9 9h11a2 2 0 012 2v9a2 2 0 01-2 2H9a2 2 0 01-2-2V11a2 2 0 012-2zM5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1',
  maximize: 'M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
};

export default function Icon({ name, size = 18, color = 'currentColor', strokeWidth = 2, style, className }) {
  const def = paths[name] || paths.code;
  const parts = def.split('|||');
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      aria-hidden="true"
    >
      {parts.map((p, i) => {
        if (p.startsWith('circle:')) {
          const [cx, cy, r] = p.slice(7).split(',');
          return <circle key={i} cx={cx} cy={cy} r={r} />;
        }
        if (!p) return null;
        return <path key={i} d={p} />;
      })}
    </svg>
  );
}
