import React from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'

export default function Page() {
  return (
    <div id="title">
      <Link id="to-index" href="/">
        to index
      </Link>
    </div>
  )
}

export const metadata: Metadata = {
  title: 'this is the page title',
}
