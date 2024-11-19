import React from 'react'
import Link from 'next/link'
import { RedButton } from '../components/red-button'

export default function Home() {
  return (
    <>
      {/* To reproduce, RedButton should be imported. */}
      <RedButton />
      <Link href="/next-dynamic">/next-dynamic</Link>
      <Link href="/next-dynamic-ssr-false">/next-dynamic-ssr-false</Link>
      <Link href="/react-lazy">/react-lazy</Link>
    </>
  )
}
