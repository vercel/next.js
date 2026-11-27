import { connection } from 'next/server'
import { Suspense } from 'react'
import { Links } from '../../components/links'

async function RequestContent() {
  await connection()
  return <p id="content">Per-request content</p>
}

// A fixed path rendered per request, so without Cache Components it has no
// prerendered segment data for the router's segment prefetch.
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
