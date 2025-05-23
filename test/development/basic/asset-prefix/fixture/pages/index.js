import Link from 'next/link'
import React from 'react'

export default function Page() {
  return (
    <>
      <div id="text">Hello World</div>
      <Link href="/page2">Page 2</Link>
    </>
  )
}
