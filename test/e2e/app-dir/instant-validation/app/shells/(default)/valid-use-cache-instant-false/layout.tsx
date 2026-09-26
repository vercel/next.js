'use cache'
import type { ReactNode } from 'react'

// A file-level `"use cache"` directive wraps every exported function in a cache
// boundary. `instant` is a statically known non-function value, so it stays a
// plain export and is read as route segment config.
export const instant = false

export default async function IgnoreStaticShellValidationLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
