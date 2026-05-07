import Link from 'next/link'
import { Suspense } from 'react'
import GroupedSlugClient from './slug-client'

export default function GroupedSlugPage() {
  return (
    <main>
      <Suspense fallback={<h1>Loading grouped slug...</h1>}>
        <GroupedSlugClient />
      </Suspense>
      <ul>
        <li>
          <Link href="/grouped">Visit grouped index</Link>
        </li>
      </ul>
    </main>
  )
}
