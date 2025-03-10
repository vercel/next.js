'use client'

import { usePathname } from 'next/navigation'
import { use } from 'react'

export default function Page() {
  const pathname = usePathname()

  use(new Promise((resolve) => setTimeout(resolve, 1000)))

  return <div data-slug={pathname}>{pathname}</div>
}
