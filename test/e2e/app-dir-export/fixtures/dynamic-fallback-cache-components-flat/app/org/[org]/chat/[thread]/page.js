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
      </ul>
    </>
  )
}
