import Link from 'next/link'
import React from 'react'

export default function Page() {
  return (
    <>
      <p>hello world</p>
      <Link href="/photos/next/1">to photos page A</Link>
      <Link href="/feed/photos/1">to photos page B</Link>
    </>
  )
}
