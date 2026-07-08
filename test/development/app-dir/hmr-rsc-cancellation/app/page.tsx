import { connection } from 'next/server'
import { Suspense } from 'react'

// Editing any of these constants triggers a Server Components HMR refresh.
// `boundaryKey` is the Suspense boundary's key: changing it remounts the
// boundary, so the remounted boundary has no prior content and commits its
// fallback while `DynamicContent` streams (a partially committed tree).
const boundaryKey = 'initial'
const dynamicMarker = 'initial'
const dynamicDelayMs = 0

// Logs when React renders it. A superseded refresh's render is aborted while
// `DynamicContent` is still awaiting, so React never renders this child and no
// log arrives for that marker; only the refresh that commits logs.
function DynamicMarker({ marker }: { marker: string }) {
  console.log(`[hmr-rsc-cancellation] rendered ${marker}`)
  return <p id="dynamic">{marker}</p>
}

async function DynamicContent() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, dynamicDelayMs))
  return <DynamicMarker marker={dynamicMarker} />
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
