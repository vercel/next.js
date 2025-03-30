import React from 'react'
import Link from 'next/link'
import { RedButton } from '../../components/red-button'
import { RedButtonLazy } from '../../components/red-button-lazy'

export default function Home() {
  return (
    <>
      {/* To reproduce, RedButton and RedButtonLazy should be imported. */}
      <RedButton />
      <RedButtonLazy />
      <Link href="/nodejs/dynamic-import">/nodejs/dynamic-import</Link>
    </>
  )
}
