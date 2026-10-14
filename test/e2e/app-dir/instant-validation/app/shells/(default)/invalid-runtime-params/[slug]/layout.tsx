import type { ReactNode } from 'react'

export const instant = false

export default function IgnoreStaticShellValidationLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
