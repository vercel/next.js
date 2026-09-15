'use client'

import { usePathname } from 'next/navigation'

export function ServerPathname() {
  return <output id="server-pathname">{usePathname()}</output>
}
