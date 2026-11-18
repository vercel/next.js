import { randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
import { Suspense } from 'react'

async function Generation() {
  'use cache'

  return <p id="generation">{randomUUID()}</p>
}

async function RequestContent() {
  const requestHeaders = await headers()
  return (
    <p id="request-value">{requestHeaders.get('x-prerender-methods-value')}</p>
  )
}

export default function Page() {
  return (
    <main>
      <h1>Partial page</h1>
      <Generation />
      <Suspense fallback={<p>Loading request content</p>}>
        <RequestContent />
      </Suspense>
    </main>
  )
}
