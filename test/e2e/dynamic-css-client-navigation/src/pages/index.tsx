import React from 'react'
import Link from 'next/link'
import { RedButton } from '../components/red-button'

export default function Home() {
  return (
    <>
      <RedButton />
      <Link href="/dynamic-import">/dynamic-import</Link>
      <Link href="/next-dynamic">/next-dynamic</Link>
      <Link href="/react-lazy">/react-lazy</Link>
    </>
  )
}
