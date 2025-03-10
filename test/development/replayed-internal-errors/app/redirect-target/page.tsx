import * as React from 'react'
import Link from 'next/link'

export default function Page() {
  return (
    <>
      <h1>Redirected</h1>
      <Link href="/">go back</Link>
    </>
  )
}
