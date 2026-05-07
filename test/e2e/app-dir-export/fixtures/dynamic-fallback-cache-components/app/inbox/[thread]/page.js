import Link from 'next/link'
import { Suspense } from 'react'
import InboxThreadClient from './thread-client'

export default function InboxThreadPage() {
  return (
    <>
      <Suspense fallback={<h1>Loading inbox thread...</h1>}>
        <InboxThreadClient />
      </Suspense>
      <ul>
        <li>
          <Link href="/inbox">Visit inbox index</Link>
        </li>
      </ul>
    </>
  )
}
