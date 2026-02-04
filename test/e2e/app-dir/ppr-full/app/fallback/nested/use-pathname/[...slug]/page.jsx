'use client'

import { usePathname } from 'next/navigation'

export default function Page() {
  const pathname = usePathname()

  return <div data-slug={pathname}>{pathname}</div>
}
