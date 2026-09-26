import { Suspense } from 'react'
import { SlugClient } from './client'

export const unstable_ensureStatic = 'navigation'

type Params = { slug: string }

export default function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <SlugClient params={params} />
      </Suspense>
    </main>
  )
}
