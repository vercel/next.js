import * as React from 'react'
import Link from 'next/link'

/** Add your relevant code here for the issue to reproduce */
export default function Home() {
  return (
    <>
      <Link href="/will-redirect">Go to a page that calls redirect()</Link>
      <Link href="/will-notfound">Go to a page that calls notFound()</Link>
    </>
  )
}
