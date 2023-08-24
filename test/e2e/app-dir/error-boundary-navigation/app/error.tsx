'use client'
import Link from 'next/link'

export default function ErrorComponent() {
  return (
    <>
      <h1 id="error-component">Error Happened!</h1>
      <Link href="/result" id="to-result">
        To Result
      </Link>
    </>
  )
}
