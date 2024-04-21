/* eslint-disable no-script-url */
'use client'
import Link from 'next/link'

export default function Page() {
  return (
    <Link
      id="trigger"
      href="/about"
      as="javascript:console.log('XSS untrusted client-side navigation with as');"
    >
      untrusted client-side navigation with as
    </Link>
  )
}
