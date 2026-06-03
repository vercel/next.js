'use client'

import { usePathname } from 'next/navigation'

export function PathnameLabel() {
  const pathname = usePathname()
  return <span data-testid="pathname-label">{pathname}</span>
}
