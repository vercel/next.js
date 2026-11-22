import { Suspense } from 'react'
import { getTestData } from '../../lib/test-data-service'

// Same as /streaming-target. The test drops the connection of its response
// after the shell.
export const instant = false

async function LateSection() {
  return <p id="streaming-late">{await getTestData('error-late')}</p>
}

export default async function Page() {
  const shell = await getTestData('error-shell')
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
