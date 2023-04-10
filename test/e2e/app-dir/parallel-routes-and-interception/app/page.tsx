import Link from 'next/link'
import React from 'react'

export default function Page() {
  return (
    <>
      <p>hello world</p>
      <Link href="/nested">to nested</Link>
    </>
  )
}
