'use client'
export default function IconMonitor({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="2"
        y="3"
        width="20"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M8 21h8M12 17v4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
