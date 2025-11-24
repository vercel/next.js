import React from 'react'
import Link from 'next/link'
import { RedButton } from '../../components/red-button'

export default function Home() {
  return (
    <>
      {/* To reproduce, RedButton should be imported. */}
      <RedButton />
      <Link href="/edge/next-dynamic">/edge/next-dynamic</Link>
      <Link href="/edge/next-dynamic-ssr-false">
        /edge/next-dynamic-ssr-false
      </Link>
      <Link href="/edge/react-lazy">/edge/react-lazy</Link>
    </>
  )
}

export const runtime = 'experimental-edge'
