export type IconName =
  | 'play'
  | 'pause'
  | 'stepBack'
  | 'stepForward'
  | 'reset'
  | 'shuffle'
  | 'eye'
  | 'eyeOff'
  | 'expand'
  | 'compress'
  | 'strategy'
  | 'trade'
  | 'costs'
  | 'save'
  | 'open'
  | 'trash'
  | 'skip'
  | 'check'
  | 'plus'
  | 'back'
  | 'close'
  | 'download'
  | 'sun'
  | 'moon'
  | 'dashed'
  | 'cursor'
  | 'trendLine'
  | 'horizontalLine'
  | 'ray'
  | 'verticalLine'
  | 'rectangle'
  | 'ellipse'
  | 'fib'
  | 'text'
  | 'brush'
  | 'measure'
  | 'arrowUp'
  | 'arrowDown'
  | 'undo'
  | 'redo'

const PATHS: Record<IconName, string> = {
  play: 'M8 5v14l11-7z',
  pause: 'M7 5h3v14H7zm7 0h3v14h-3z',
  stepBack: 'M11 6l-8 6 8 6V6zm10 0h-3v12h3V6z',
  stepForward: 'M13 6l8 6-8 6V6zM3 6h3v12H3V6z',
  reset: 'M4 4v6h6M20 20v-6h-6M5.5 9A7 7 0 0 1 19 8.5M18.5 15A7 7 0 0 1 5 15.5',
  shuffle: 'M16 3h5v5M4 7h5l7 10h4M21 16v5h-5M4 17h5l2-3',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff:
    'M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.2A10 10 0 0 1 12 5c6 0 10 7 10 7a16 16 0 0 1-3.2 3.8M6.1 6.1A16 16 0 0 0 2 12s4 7 10 7a10 10 0 0 0 4.3-.9',
  expand: 'M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5',
  compress: 'M8 3v5H3M16 3v5h5M8 21v-5H3M21 16h-5v5',
  strategy: 'M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8',
  trade: 'M7 17V7m0 0L4 10m3-3 3 3M17 7v10m0 0 3-3m-3 3-3-3',
  costs: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  save: 'M5 3h11l3 3v15H5V3zm3 0v6h8V3M8 14h8',
  open: 'M3 7h6l2 2h10v10H3V7z',
  trash: 'M4 7h16M9 7V5h6v2M7 7v12h10V7',
  skip: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 13l4 4L19 7',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 6l-6 6 6 6',
  close: 'M6 6l12 12M18 6L6 18',
  download: 'M12 3v12m0 0l-4-4m4 4l4-4M4 21h16',
  sun: 'M12 4V2M12 22v-2M4.9 4.9 3.5 3.5M20.5 20.5l-1.4-1.4M4 12H2M22 12h-2M4.9 19.1 3.5 20.5M20.5 3.5l-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  moon: 'M21 14.3A8.5 8.5 0 1 1 9.7 3 7 7 0 0 0 21 14.3z',
  dashed: 'M3 12h3M10 12h3M17 12h3',
  cursor: 'M4 3l16 6-6.5 2.5L11 18z',
  trendLine: 'M4 20L20 4',
  horizontalLine: 'M3 12h18',
  ray: 'M3 12h14m0 0-4-4m4 4-4 4',
  verticalLine: 'M12 3v18',
  rectangle: 'M4 6h16v12H4z',
  ellipse: 'M4 12a8 5 0 1 0 16 0 8 5 0 1 0-16 0z',
  fib: 'M3 6h18M6 10.5h12M9 15h6M6 19.5h12',
  text: 'M5 4h14M12 4v16M8 20h8',
  brush: 'M3 21l4-1L18 9l-3-3L4 17l-1 4zM15 4l3 3',
  measure: 'M4 16L16 4M7 13l2 2M11 9l2 2',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowDown: 'M12 5v14M19 12l-7 7-7-7',
  undo: 'M7 10H3V6M3 10a8 8 0 1 1 2.3 6.7',
  redo: 'M17 10h4V6M21 10a8 8 0 1 0-2.3 6.7'
}

export function Icon({ name, size = 15 }: { name: IconName; size?: number }): React.JSX.Element {
  return (
    <svg
      className="ui-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
