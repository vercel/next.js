import { headers } from 'next/headers'
import { setTimeout } from 'node:timers/promises'
import { Suspense } from 'react'

async function UncachedContent() {
  await setTimeout(0)
  return <p>Unrelated uncached work</p>
}

export default function Page() {
  headers()
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <UncachedContent />
    </Suspense>
  )
}
