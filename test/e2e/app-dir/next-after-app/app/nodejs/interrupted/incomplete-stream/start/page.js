'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Page() {
  const pathname = usePathname()
  return (
    <main>
      <h1>Start</h1>
      <Link href={pathname.replace('/start', '/hang')}>hang</Link>
    </main>
  )
}
