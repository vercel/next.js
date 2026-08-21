'use client'

import { usePathname } from 'next/navigation'

// Renders the router's pathname on the server and during hydration, so a
// mismatch between the two shows up as a hydration error.
export function ServerPathname() {
  return <output id="server-pathname">{usePathname()}</output>
}
