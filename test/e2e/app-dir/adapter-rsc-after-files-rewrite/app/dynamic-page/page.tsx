import { connection } from 'next/server'
import { Suspense } from 'react'
import { Links } from '../../components/links'

async function RequestContent() {
  await connection()
  return <p id="content">Per-request content</p>
}

// A fixed path rendered per request. Its RSC request reaches the function
// through a routing entry instead of a prerendered output.
export default function Page() {
  return (
    <>
      <h1 id="page">Per-request page</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <RequestContent />
      </Suspense>
      <Links />
    </>
  )
}
