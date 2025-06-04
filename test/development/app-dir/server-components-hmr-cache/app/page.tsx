import Link from 'next/link'
import React from 'react'

export default function Page() {
  return (
    <>
      <p>
        <Link href="/edge">edge</Link>
      </p>
      <p>
        <Link href="/node">node</Link>
      </p>
    </>
  )
}
