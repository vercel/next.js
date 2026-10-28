'use client'

import { icons } from '@/lib/icon-paths'

export function Icon({
  name,
  size = 20,
  label,
}: {
  name: string
  size?: number
  label?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={icons[name]} />
    </svg>
  )
}
