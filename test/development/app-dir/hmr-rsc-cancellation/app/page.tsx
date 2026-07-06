import { connection } from 'next/server'
import { Suspense } from 'react'

// Editing any of these constants triggers a Server Component HMR refresh.
// `boundaryKey` is the Suspense boundary's key: changing it remounts the
// boundary, so the remounted boundary has no prior content and commits its
// fallback while `DynamicContent` streams — a partially committed tree.
const boundaryKey = 'initial'
const dynamicMarker = 'initial'
const dynamicDelayMs = 0

async function DynamicContent() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, dynamicDelayMs))
  return <p id="dynamic">{dynamicMarker}</p>
}

export default function Page() {
  return (
    <main>
      <p id="shell">shell</p>
      <Suspense key={boundaryKey} fallback={<p id="dynamic">loading</p>}>
        <DynamicContent />
      </Suspense>
    </main>
  )
}
