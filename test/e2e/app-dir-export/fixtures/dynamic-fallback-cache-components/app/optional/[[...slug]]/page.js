import Link from 'next/link'
import { Suspense } from 'react'
import OptionalSlugClient from './slug-client'

export default function OptionalCatchAllPage() {
  return (
    <main>
      <Suspense fallback={<h1>Loading optional...</h1>}>
        <OptionalSlugClient />
      </Suspense>
      <ul>
        <li>
          <Link href="/optional/deep/path">Visit optional deep path</Link>
        </li>
      </ul>
    </main>
  )
}
