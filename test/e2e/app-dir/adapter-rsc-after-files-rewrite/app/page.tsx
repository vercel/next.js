import { connection } from 'next/server'
import { Suspense } from 'react'
import { Links } from '../components/links'

async function RequestContent() {
  await connection()
  return <p id="content">Root request content</p>
}

// Rendered per request, so its RSC request reaches the function through the
// root `/index.rsc` routing entry instead of a prerendered output.
export default function Page() {
  return (
    <>
      <h1 id="page">Root page</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <RequestContent />
      </Suspense>
      <Links />
    </>
  )
}
