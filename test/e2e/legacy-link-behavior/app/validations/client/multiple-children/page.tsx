'use client'

import Link from 'next/link'

export default function Page() {
  return (
    <Link href="/about" legacyBehavior>
      <span>a</span>
      <span>b</span>
    </Link>
  )
}
