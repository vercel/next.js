import { Suspense } from 'react'
import IsolatedSlugClient from './slug-client'

export default function Page() {
  return (
    <main>
      <Suspense fallback={<h1>Loading isolated slug...</h1>}>
        <IsolatedSlugClient />
      </Suspense>
    </main>
  )
}
