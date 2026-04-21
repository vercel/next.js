import Link from 'next/link'
import { Suspense } from 'react'
import DocsSlugClient from './slug-client'

export default function DocsCatchAllPage() {
  return (
    <main>
      <Suspense fallback={<h1>Loading docs...</h1>}>
        <DocsSlugClient />
      </Suspense>
      <ul>
        <li>
          <Link href="/docs">Visit docs index</Link>
        </li>
      </ul>
    </main>
  )
}
