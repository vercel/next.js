import { connection } from 'next/server'
import { Suspense } from 'react'
import { ActionForm } from './form'

export default function Page() {
  return (
    <main>
      <h1>Server Action on a partial page</h1>
      <ActionForm />
      <Suspense fallback={<p>Loading request data</p>}>
        <RequestData />
      </Suspense>
    </main>
  )
}

async function RequestData() {
  await connection()
  return <p>Request data ready</p>
}
