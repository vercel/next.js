'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Page() {
  const pathname = usePathname()
  return (
    <>
      <p id="pathname">{pathname}</p>
      <Link href="/other" id="to-other">
        Go to other
      </Link>
    </>
  )
}
