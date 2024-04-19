'use client'
import Link from 'next/link'

export default function Page() {
  return (
    <Link
      id="trigger"
      href="javascript:console.log('XSS untrusted client-side navigation');"
    >
      untrusted client-side navigation
    </Link>
  )
}
