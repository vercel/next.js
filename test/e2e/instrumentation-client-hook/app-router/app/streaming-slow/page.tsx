import { Suspense } from 'react'
import { connection } from 'next/server'
// JSX treats lowercase-first tags as host elements, so the unstable_
// export must be aliased to a capitalized name to render as a component.
import { unstable_RouterTransitionEndMarker as RouterTransitionEndMarker } from 'next/navigation'

async function StreamedContent() {
  // Like /streaming, but slow enough (~3s) that a test can deterministically
  // interleave a shallow history update between the navigation's commit and
  // the marker's reveal.
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 3000))
  return (
    <>
      <p id="streaming-slow-content">Slowly streamed content</p>
      <RouterTransitionEndMarker />
    </>
  )
}

export default function Page() {
  return (
    <>
      <h1 id="streaming-slow-page">Streaming slow</h1>
      <Suspense fallback={<p id="streaming-slow-fallback">Loading…</p>}>
        <StreamedContent />
      </Suspense>
    </>
  )
}
