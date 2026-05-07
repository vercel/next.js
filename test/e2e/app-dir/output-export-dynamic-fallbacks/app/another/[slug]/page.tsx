import { Suspense } from 'react'
import SlugClient from './slug-client'

export default function Page() {
  return (
    <main>
      <Suspense fallback={<h1>Loading slug...</h1>}>
        <SlugClient />
      </Suspense>
    </main>
  )
}
