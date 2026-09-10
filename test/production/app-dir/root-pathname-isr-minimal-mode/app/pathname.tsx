'use client'

import { usePathname } from 'next/navigation'

export function Pathname() {
  return <p id="pathname">{usePathname()}</p>
}
