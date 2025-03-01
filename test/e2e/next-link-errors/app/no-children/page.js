import React from 'react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function Page() {
  return <Link href="/about" legacyBehavior></Link>
}
