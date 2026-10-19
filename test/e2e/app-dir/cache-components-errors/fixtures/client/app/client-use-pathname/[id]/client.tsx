'use client'

import { usePathname } from 'next/navigation'

export function Client() {
  usePathname()
  return <p>hello world</p>
}
