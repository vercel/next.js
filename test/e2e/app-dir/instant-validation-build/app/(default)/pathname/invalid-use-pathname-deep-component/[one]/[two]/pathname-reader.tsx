'use client'

import { usePathname } from 'next/navigation'

export function PathnameReader() {
  const pathname = usePathname()
  return <span data-testid="pathname">{pathname}</span>
}
