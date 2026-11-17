'use client'

import { usePathname } from 'next/navigation'

export function PathnameView() {
  return <p id="pathname">{usePathname()}</p>
}
