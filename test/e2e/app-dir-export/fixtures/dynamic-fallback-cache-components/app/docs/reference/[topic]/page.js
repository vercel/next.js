import Link from 'next/link'
import { Suspense } from 'react'
import ReferenceTopicClient from './topic-client'

export default function DocsReferenceTopicPage() {
  return (
    <main>
      <Suspense fallback={<h1>Loading reference...</h1>}>
        <ReferenceTopicClient />
      </Suspense>
      <ul>
        <li>
          <Link href="/docs">Visit docs index</Link>
        </li>
      </ul>
    </main>
  )
}
