import { Suspense } from 'react'
import { connection } from 'next/server'

export async function generateMetadata() {
  await connection()
  return { title: 'Bot prefetch regression' }
}

async function Dynamic() {
  await connection()
  return <p id="dynamic">Dynamic content</p>
}

export default function Page() {
  return (
    <main>
      <p id="content">BOT_PREFETCH_CONTENT_MARKER</p>
      <Suspense fallback={<p>Loading...</p>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}
