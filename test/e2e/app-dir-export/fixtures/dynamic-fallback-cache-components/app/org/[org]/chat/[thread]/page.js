import Link from 'next/link'
import { Suspense } from 'react'
import OrgThreadClient from './thread-client'

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
          <Link href="/org/acme/chat/thread-456">
            Visit org chat thread 456
          </Link>
        </li>
      </ul>
    </>
  )
}
