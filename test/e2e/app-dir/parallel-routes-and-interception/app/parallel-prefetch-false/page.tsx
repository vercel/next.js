import Link from 'next/link'
import React from 'react'

export default function Layout() {
  return (
    <div>
      <Link prefetch={false} href="/parallel-prefetch-false/foo">
        link
      </Link>
    </div>
  )
}
