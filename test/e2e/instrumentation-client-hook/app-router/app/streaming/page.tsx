import { Suspense } from 'react'
import { connection } from 'next/server'
// JSX treats lowercase-first tags as host elements, so the unstable_
// export must be aliased to a capitalized name to render as a component.
import { unstable_RouterTransitionEndMarker as RouterTransitionEndMarker } from 'next/navigation'

async function StreamedContent() {
  // Dynamic + delayed so the content always arrives after the navigation
  // commits: the commit shows the fallback, and the marker reveals with the
  // streamed content ~1s later.
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return (
    <>
      <p id="streaming-content">Streamed content</p>
      {/* The app declares the page loaded when this content shows: the
          marker is inside the Suspense boundary, so it mounts in the React
          commit that reveals the streamed content. */}
      <RouterTransitionEndMarker />
    </>
  )
}

export default function Page() {
  return (
    <>
      <h1 id="streaming-page">Streaming</h1>
      <Suspense fallback={<p id="streaming-fallback">Loading…</p>}>
        <StreamedContent />
      </Suspense>
    </>
  )
}
