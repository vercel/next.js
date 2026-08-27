import { connection } from 'next/server'
import { Suspense } from 'react'
import { ActionForm } from './form'

export default async function Page() {
  const cachedTimestamp = await getCachedTimestamp()

  return (
    <main>
      <h1>Server Action on a partial page</h1>
      <p id="cached-timestamp">{cachedTimestamp}</p>
      <ActionForm />
      <Suspense fallback={<p>Loading request data</p>}>
        <RequestData />
      </Suspense>
    </main>
  )
}

async function getCachedTimestamp() {
  'use cache'

  return Date.now()
}

async function RequestData() {
  await connection()
  return <p>Request data ready</p>
}
