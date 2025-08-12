import Link from 'next/link'
import React, { Suspense } from 'react'
import { Dynamic } from '../components/dynamic'

export default () => {
  return (
    <>
      <Suspense fallback={<Dynamic pathname="/" fallback />}>
        <Dynamic pathname="/" />
      </Suspense>
      <Link href="/cart">to /cart</Link>
    </>
  )
}
