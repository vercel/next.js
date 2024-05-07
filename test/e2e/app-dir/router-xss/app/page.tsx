'use client'
import Link from 'next/link'

export default function Page() {
  return (
    <ul>
      <li>
        <Link href="/untrusted-client-side-navigation">
          untrusted client-side navigation
        </Link>
      </li>
      <li>
        <Link href="/untrusted-client-side-navigation-with-as">
          untrusted client-side navigation with as
        </Link>
      </li>
      <li>
        <Link href="/untrusted-push">untrusted push</Link>
      </li>
      <li>
        <Link href="/trusted-push">trusted push</Link>
      </li>
    </ul>
  )
}
