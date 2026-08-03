'use client'
export default function IconRocket({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M9 12c2-5 5.5-8 11-9-1 5.5-4 9-9 11-1 .5-2-1.5-2-2Z"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinejoin="round"
      />
      <circle cx="15" cy="9" r="1.5" fill="currentColor" />
    </svg>
  )
}
