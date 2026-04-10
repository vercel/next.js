import Link from 'next/link'
import { Suspense } from 'react'
import OrgThreadClient from './thread-client'

export function generateStaticParams() {
  return [
    { org: 'acme', thread: 'thread-123' },
    { org: 'acme', thread: 'thread-456' },
  ]
}

export default function OrgThreadPage() {
  return (
    <>
      <Suspense fallback={<h1>Loading org thread...</h1>}>
        <OrgThreadClient />
      </Suspense>
      <ul>
        <li>
          <Link href="/org">Visit org index</Link>
        </li>
        <li>
          <Link href="/org/acme/chat/thread-789">
            Visit fallback org chat thread
          </Link>
        </li>
      </ul>
    </>
  )
}
