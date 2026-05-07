import { Suspense } from 'react'
import DocsCatchAllClient from './slug-client'

export default function DocsCatchAllPage() {
  return (
    <main>
      <Suspense fallback={<h1>Loading docs catch-all...</h1>}>
        <DocsCatchAllClient />
      </Suspense>
    </main>
  )
}
