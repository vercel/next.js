const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function FixCardAlignLeftIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 6h18M3 12h12M3 18h18" />
    </svg>
  )
}

export function FixCardRotateCwIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="4" width="18" height="7" rx="1.5" />
      <rect x="3" y="13" width="18" height="7" rx="1.5" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </svg>
  )
}

export function FixCardHistoryIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  )
}

export function FixCardOctagonIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M10 2h4" />
      <circle cx="12" cy="14" r="8" />
      <path d="M5 7L19 21" />
    </svg>
  )
}

export function FixCardLayoutIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  )
}

export function FixCardZapIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 2l8.5 5v10L12 22l-8.5-5V7z" />
    </svg>
  )
}

export function FixCardTimerIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M10 2h4" />
      <path d="M12 14v-4" />
      <circle cx="12" cy="14" r="8" />
    </svg>
  )
}

export function FixCardDatabaseIcon() {
  return (
    <svg {...ICON_PROPS}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      <path d="M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6" />
    </svg>
  )
}

export function FixCardPointerClickIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M9 9l5 12 1.8-5.2L21 14z" />
      <path d="M7.2 2.2L8 5.1" />
      <path d="M5.1 8L2.2 7.2" />
      <path d="M14 4.1L12 6" />
      <path d="M6 12l-1.9 2" />
    </svg>
  )
}
