import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'

// Dynamic metadata: it reads request-time data (`connection()`), so it is not
// part of the prefetchable App Shell and must be fetched on navigation.
export async function generateMetadata(): Promise<Metadata> {
  await connection()
  return { title: 'Slow Page' }
}

async function DynamicContent() {
  await connection()
  return <p id="slow-content">Slow content</p>
}

export default function SlowPage() {
  return (
    <main>
      <Suspense fallback={<p id="slow-fallback">loading…</p>}>
        <DynamicContent />
      </Suspense>
    </main>
  )
}
