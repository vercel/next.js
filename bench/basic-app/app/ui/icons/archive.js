'use client'
export default function IconArchive({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="2"
        y="3"
        width="20"
        height="5"
        rx="1"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}
