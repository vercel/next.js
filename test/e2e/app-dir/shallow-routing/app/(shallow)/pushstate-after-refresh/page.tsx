import { connection } from 'next/server'
import { Suspense } from 'react'
import { Controls } from './controls'

async function ServerTime() {
  await connection()
  return <p id="server-time">{new Date().toISOString()}</p>
}

export default function Page() {
  return (
    <>
      <h2 id="pushstate-after-refresh">PushState After Refresh</h2>
      <Suspense fallback={<p>Loading...</p>}>
        <ServerTime />
      </Suspense>
      <Suspense fallback={<p>Loading...</p>}>
        <Controls />
      </Suspense>
    </>
  )
}
