'use client'

import { usePathname } from 'next/navigation'

export function PathnameReader() {
  // usePathname() should throw because not all params are provided in samples
  const pathname = usePathname()
  return <div id="result">pathname: {pathname}</div>
}
