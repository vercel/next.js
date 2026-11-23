import { Suspense } from 'react'
import { getTestData } from '../lib/test-data-service'

async function LateSection({ name }: { name: string }) {
  return <p id="streaming-late">{await getTestData(`${name}-late`)}</p>
}

// Blocks on its shell data, outside any Suspense boundary, so a navigation to
// it can't commit until that data streams in. Then streams a late section.
export async function StreamingPage({ name }: { name: string }) {
  const shell = await getTestData(`${name}-shell`)
  return (
    <>
      <h1 id="streaming-shell">{shell}</h1>
      <Suspense
        fallback={<p id="streaming-late-fallback">Loading late section...</p>}
      >
        <LateSection name={name} />
      </Suspense>
    </>
  )
}
