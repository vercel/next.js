import { Suspense } from 'react'
import { Client } from '../../client'

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default function Page() {
  return (
    <main>
      <p id="title">Static page</p>
      <Suspense fallback={<p>Loading params</p>}>
        <Client />
      </Suspense>
    </main>
  )
}
