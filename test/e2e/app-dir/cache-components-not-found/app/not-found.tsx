import { Suspense } from 'react'
import { connection } from 'next/server'

import { getSentinelValue } from './getSentinelValue'

export default function GlobalNotFound() {
  return (
    <>
      <h1>Global Not Found</h1>
      <p>
        This global 404 has a static shell and a dynamic hole. The dynamic hole
        reads `connection()` inside a Suspense boundary, so with Cache
        Components the shell (including the Suspense fallback) is prerendered
        and the hole is refilled when the render resumes at request time.
      </p>
      <div id="not-found-shell">{getSentinelValue()}</div>
      <Suspense
        fallback={
          <>
            <p>loading dynamic 404 content...</p>
            <div id="not-found-fallback">{getSentinelValue()}</div>
          </>
        }
      >
        <DynamicNotFoundContent />
      </Suspense>
    </>
  )
}

async function DynamicNotFoundContent() {
  await connection()
  return (
    <>
      <p>The connection was awaited inside the global 404.</p>
      <div id="not-found-hole">{getSentinelValue()}</div>
    </>
  )
}
