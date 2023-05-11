'use client'

import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <div id="foo">FOO</div>
      <Link href="/photos">To photos</Link>
    </div>
  )
}
