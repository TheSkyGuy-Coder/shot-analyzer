/**
 * Schlichte, einfarbige Linien-Icons (16x16, currentColor) im Stil klassischer Desktop-Werkzeuge.
 * Neue Icons: einfach einen Eintrag in PATHS ergänzen.
 */
const PATHS = {
  open: <path d="M1.5 12.5V3.5h4l1.5 1.5h7v7.5zM1.5 12.5l2-5.5h11.5l-2 5.5" />,
  save: <path d="M2.5 2.5h9l2 2v9h-11zM5 2.5v3.5h5V2.5M5 13.5V9h6v4.5" />,
  undo: <path d="M5.5 3 2.5 6l3 3M2.5 6h7a4 4 0 0 1 0 8H6" />,
  redo: <path d="M10.5 3l3 3-3 3M13.5 6h-7a4 4 0 0 0 0 8H10" />,
  refresh: <path d="M13 8a5 5 0 1 1-1.5-3.5M13 2.5v3h-3" />,
  cut: <path d="M3 3l10 10M3 13 13 3M3.5 3.5a1.5 1.5 0 1 0 .01 0M3.5 12.5a1.5 1.5 0 1 0 .01 0" />,
  help: <path d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM6.2 6.3A1.9 1.9 0 1 1 8.6 8.1C8.1 8.4 8 8.8 8 9.4M8 11.2v.6" />,
  prevShot: <path d="M3 3v10M13 3 6 8l7 5z" />,
  nextShot: <path d="M13 3v10M3 3l7 5-7 5z" />,
  stepBack: <path d="M11 3 5 8l6 5z" />,
  stepFwd: <path d="M5 3l6 5-6 5z" />,
  play: <path d="M4.5 2.5 12.5 8l-8 5.5z" />,
  pause: <path d="M4.5 3v10M11.5 3v10" />,
  speaker: <path d="M2 6h2.5L8 3v10L4.5 10H2zM10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.8a6 6 0 0 1 0 8.4" />,
  muted: <path d="M2 6h2.5L8 3v10L4.5 10H2zM10.5 6l4 4M14.5 6l-4 4" />,
  fit: <path d="M1.5 8h13M4 5.5 1.5 8 4 10.5M12 5.5 14.5 8 12 10.5" />,
  select: <path d="M4 2.5v10l2.7-2.5 1.9 4 1.7-.8-1.9-3.9h3.6z" />,
  pen: <path d="M2.5 13.5l.7-3L11 2.7a1.4 1.4 0 0 1 2 0l.3.3a1.4 1.4 0 0 1 0 2L5.5 12.8z M9.8 4l2.2 2.2" />,
  line: <path d="M3 13 13 3" />,
  arrow: <path d="M3 13 13 3M7 3h6v6" />,
  rect: <path d="M2.5 4.5h11v7h-11z" />,
  ellipse: <ellipse cx="8" cy="8" rx="6" ry="4.5" />,
  eraser: <path d="M2.5 10.5 9 4l4.5 4.5L9 13H5.5zM6 7.5 10.5 12M9 13h5" />,
  trash: <path d="M3 4.5h10M6.5 4.5v-2h3v2M4.5 4.5l.6 9h5.8l.6-9M7 7v4M9 7v4" />,
  third: <path d="M2.5 2.5h11v11h-11zM6.2 2.5v11M9.8 2.5v11M2.5 6.2h11M2.5 9.8h11" />,
  phi: <path d="M2.5 2.5h11v11h-11zM7 2.5v11M2.5 9h11" />,
  center: <path d="M2.5 2.5h11v11h-11zM8 2.5v11M2.5 8h11" />,
  chevronRight: <path d="M6 3.5 10.5 8 6 12.5" />,
  chevronDown: <path d="M3.5 6 8 10.5 12.5 6" />,
  grip: <path d="M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01" strokeWidth={2.2} />,
  plus: <path d="M8 3v10M3 8h10" />,
  folder: <path d="M1.5 12.5V3.5h4l1.5 1.5h7v7.5z" />,
  sortTime: <path d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 4.5V8l2.5 1.5" />,
  collapseAll: <path d="M3.5 3.5 8 7l4.5-3.5M3.5 12.5 8 9l4.5 3.5" />,
  expandAll: <path d="M3.5 7 8 3.5 12.5 7M3.5 9 8 12.5 12.5 9" />,
  diag: <path d="M2.5 2.5h11v11h-11zM2.5 2.5l11 11M13.5 2.5l-11 11" />
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16 }: { name: IconName; size?: number }): React.JSX.Element {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}
