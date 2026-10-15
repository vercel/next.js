import { Suspense } from 'react'
import { connection } from 'next/server'
import { CounterForm } from './counter-form'

export default function Page() {
  return (
    <main>
      <h1 id="static-shell">Static shell</h1>
      <CounterForm />
      <Suspense fallback={<p id="loading">Loading...</p>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function Dynamic() {
  await connection()
  return <p id="dynamic">Dynamic content</p>
}
