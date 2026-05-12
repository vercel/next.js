import Link from 'next/link'
import { Suspense } from 'react'
import SlugClient from './slug-client'

export default function Page() {
  return (
    <main>
      <Suspense fallback={<h1>Loading slug...</h1>}>
        <SlugClient />
      </Suspense>
      <ul>
        <li>
          <Link href="/another">Visit another page</Link>
        </li>
        <li>
          <Link href="/org/acme/chat/thread-cross">
            Visit org thread (cross-subtree)
          </Link>
        </li>
      </ul>
    </main>
  )
}
