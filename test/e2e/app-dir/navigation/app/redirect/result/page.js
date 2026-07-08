import { Suspense } from 'react'
import { connection } from 'next/server'

async function Now() {
  await connection()
  return new Date().toString()
}

export default function Page() {
  return (
    <div>
      <h1 id="result-page">Result Page</h1>
      <Suspense fallback={<div>Awaiting request timestamp...</div>}>
        <div id="timestamp">
          <Now />
        </div>
      </Suspense>
    </div>
  )
}
