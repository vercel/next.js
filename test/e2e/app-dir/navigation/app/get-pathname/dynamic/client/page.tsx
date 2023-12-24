'use client'

import Link from 'next/link'
import { getPathname } from 'next/navigation'

export default function DynamicClientPage() {
  const pathname = getPathname()

  return (
    <>
      <p id="dynamic-client-page">Dynamic Client</p>
      <p>
        Pathname - <span id="pathname">{pathname}</span>
      </p>
      <p>
        <Link href="/get-pathname" id="home">
          Home
        </Link>
      </p>
      <p>
        <Link href="/get-pathname/dynamic" id="dynamic">
          Dynamic
        </Link>
      </p>
      <p>
        <Link href="/get-pathname/dynamic/slug" id="dynamic-slug">
          Dynamic Slug
        </Link>
      </p>
      <p>
        <Link href="/get-pathname/dynamic/client" id="dynamic-client">
          Dynamic Client
        </Link>
      </p>
      <p>
        <Link
          href="/get-pathname/dynamic/rewrite-source"
          id="dynamic-rewrite-source"
        >
          Dynamic Rewrite Source
        </Link>
      </p>
    </>
  )
}
