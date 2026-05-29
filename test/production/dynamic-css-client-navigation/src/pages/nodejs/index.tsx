import React from 'react'
import Link from 'next/link'
import { RedButton } from '../../components/red-button'

export default function Home() {
  return (
    <>
      {/* To reproduce, RedButton should be imported. */}
      <RedButton />
      <Link href="/nodejs/next-dynamic">/nodejs/next-dynamic</Link>
      <Link href="/nodejs/next-dynamic-ssr-false">
        /nodejs/next-dynamic-ssr-false
      </Link>
      <Link href="/nodejs/react-lazy">/nodejs/react-lazy</Link>
    </>
  )
}
