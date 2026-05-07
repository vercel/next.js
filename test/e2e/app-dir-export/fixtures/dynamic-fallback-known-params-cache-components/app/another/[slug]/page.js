import Link from 'next/link'
import { Suspense } from 'react'
import SlugClient from './slug-client'

export function generateStaticParams() {
  return [{ slug: 'first' }, { slug: 'second' }]
}

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
          <Link href="/another/third">Visit another third (fallback)</Link>
        </li>
      </ul>
    </main>
  )
}
