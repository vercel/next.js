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

export function FixCardServerStackIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M13.5 1.5h-11v3a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1zM15 0H1v4.5A2.5 2.5 0 0 0 3.5 7h9A2.5 2.5 0 0 0 15 4.5V0M2.5 13.5v-3h11v3a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1M1 9h14v4.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 1 13.5V9m3.75 4.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5M8 12.5a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0m2.5-9a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0m-1.75.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5"
      />
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

export function FixCardLoadingIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {Array.from({ length: 12 }, (_, index) => {
        const angle = index * 30
        const opacity = 1 - index * 0.05

        return (
          <circle
            key={angle}
            cx="8"
            cy="2.3"
            r="0.9"
            fill="currentColor"
            stroke="none"
            opacity={opacity}
            transform={`rotate(${angle} 8 8)`}
          />
        )
      })}
    </svg>
  )
}

export function FixCardMinusCircleIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="10" />
      <path d="M7 12h10" />
    </svg>
  )
}

export function FixCardArrowUpIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 4v16" />
      <path d="M5 11l7-7 7 7" />
    </svg>
  )
}

export function FixCardMinusIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M5 12h14" />
    </svg>
  )
}

export function FixCardLayoutIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0 2a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1H8.75v3h1.75V16h-5v-1.5h1.75v-3H1a1 1 0 0 1-1-1zm1.5.5V10h13V2.5z"
      />
    </svg>
  )
}

export function FixCardZapIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.94 2.06 8 1l1.06 1.06 4.88 4.88L15 8l-1.06 1.06-4.88 4.88L8 15l-1.06-1.06-4.88-4.88L1 8l1.06-1.06zM3.12 8 8 12.88 12.88 8 8 3.12z"
      />
    </svg>
  )
}

export function FixCardTimerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.25 1.25v.79a7 7 0 0 0-3.64 1.5l-.58-.57-.53-.53L1.44 3.5l.53.53.58.58a7 7 0 1 0 10.9 0l.58-.58.53-.53-1.06-1.06-.53.53-.58.58a7 7 0 0 0-3.64-1.51v-.79H10v-1.5H6v1.5h1.25M2.5 9a5.5 5.5 0 1 1 11 0 5.5 5.5 0 0 1-11 0m6.25-2.25V6h-1.5v3.75h1.5v-3"
      />
    </svg>
  )
}

export function FixCardDatabaseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.3.79C4.54.29 6.2 0 8 0s3.46.29 4.7.79a5 5 0 0 1 1.57.94c.41.39.73.9.73 1.52v9.5a2 2 0 0 1-.73 1.52 5 5 0 0 1-1.57.94c-1.24.5-2.9.79-4.7.79s-3.46-.29-4.7-.79a5 5 0 0 1-1.57-.94A2 2 0 0 1 1 12.75v-9.5c0-.62.32-1.13.73-1.52A5 5 0 0 1 3.3.8m-.8 4.54V8c0 .07.03.22.26.43q.33.33 1.1.64c1.02.41 2.49.68 4.14.68s3.12-.27 4.14-.68q.77-.31 1.1-.64c.23-.21.26-.36.26-.43V5.33a6 6 0 0 1-.8.38c-1.24.5-2.9.79-4.7.79s-3.46-.29-4.7-.79a6 6 0 0 1-.8-.38m11-2.08c0 .07-.03.22-.26.43q-.33.33-1.1.64C11.12 4.73 9.65 5 8 5s-3.12-.27-4.14-.68q-.77-.31-1.1-.64c-.23-.21-.26-.36-.26-.43s.03-.22.26-.43q.33-.33 1.1-.64C4.88 1.77 6.35 1.5 8 1.5s3.12.27 4.14.68q.77.31 1.1.64c.23.21.26.36.26.43m0 6.83a6 6 0 0 1-.8.38c-1.24.5-2.9.79-4.7.79s-3.46-.29-4.7-.79a6 6 0 0 1-.8-.38v2.67c0 .07.03.22.26.43q.33.33 1.1.64c1.02.41 2.49.68 4.14.68s3.12-.27 4.14-.68q.77-.31 1.1-.64c.23-.21.26-.36.26-.43z"
      />
    </svg>
  )
}

export function FixCardPointerClickIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.5 2V0H7v2zm-4.53.03 1.5 1.5 1.06-1.06-1.5-1.5zm3.28 2.22.55 1.5 3 8.26.67 1.84.73-1.82 1.07-2.7 3.2 3.2 1.06-1.06-3.2-3.2 2.7-1.07 1.82-.73-1.84-.67-8.25-3zm7.4 4.28-1.53.61q-.7.29-.98.98l-.6 1.53-1.79-4.9zM0 7h2V5.5H0z"
      />
    </svg>
  )
}
