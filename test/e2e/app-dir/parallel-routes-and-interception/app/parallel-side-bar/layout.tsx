import React from 'react'
import Link from 'next/link'

export default function Layout({
  children,
  sidebar,
}: {
  children: React.ReactNode
  sidebar: React.ReactNode
}) {
  return (
    <>
      <Link className="mr-4" href="/parallel-side-bar">
        Home
      </Link>
      <Link className="mr-4" href="/parallel-side-bar/nested">
        Nested
      </Link>
      <Link className="mr-4" href="/parallel-side-bar/nested/deeper">
        Nested Deeper
      </Link>

      {sidebar}
      {children}
    </>
  )
}
