import { Suspense } from 'react'
import { getTestData } from '../../lib/test-data-service'

// The page blocks on its data, outside any Suspense boundary, so a navigation
// to it can't commit until that data streams in.
export const instant = false

async function LateSection() {
  return <p id="streaming-late">{await getTestData('streaming-late')}</p>
}

export default async function Page() {
  const shell = await getTestData('streaming-shell')
  return (
    <>
      <h1 id="streaming-shell">{shell}</h1>
      <Suspense
        fallback={<p id="streaming-late-fallback">Loading late section...</p>}
      >
        <LateSection />
      </Suspense>
    </>
  )
}
