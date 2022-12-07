import Link from 'next/link'
import React from 'react'

export default function Page() {
  return (
    <div
      id="page"
      style={{
        background: 'yellow',
        height: 100,
        width: 100,
      }}
    >
      <Link id="link-small-page" href="/server/small-page">
        Link to small-page
      </Link>
    </div>
  )
}
