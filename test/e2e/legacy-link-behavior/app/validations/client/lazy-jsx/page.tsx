'use client'

import Link from 'next/link'
import { lazy } from 'react'

export default function Page() {
  return (
    <>
      <Link href="/about" legacyBehavior passHref>
        {/* @ts-ignore */}
        {lazyJSX}
      </Link>
    </>
  )
}

// @ts-ignore
const lazyJSX = lazy(() => Promise.resolve({ default: <a>About</a> }))
