'use client'

import { createContext, useContext } from 'react'

// The icon paths are provided by the root layout, so only the icons in use reach the browser
// instead of the whole design-system set in lib/icon-paths.ts.
const IconContext = createContext<Record<string, string>>({})

export function IconProvider({
  icons,
  children,
}: {
  icons: Record<string, string>
  children: React.ReactNode
}) {
  return <IconContext value={icons}>{children}</IconContext>
}

export function Icon({
  name,
  size = 20,
  label,
}: {
  name: string
  size?: number
  label?: string
}) {
  const icons = useContext(IconContext)
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
