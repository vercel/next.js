import { Suspense } from 'react'
import { connection } from 'next/server'

// STATIC metadata, but a dynamic body. The head is complete at prefetch time,
// but the page segment is still fetched dynamically on navigation.
export const metadata = {
  title: 'Static Meta',
}

async function DynamicContent() {
  await connection()
  return <p id="static-meta-content">Static meta content</p>
}

export default function StaticMetaPage() {
  return (
    <main>
      <Suspense fallback={<p id="static-meta-fallback">loading…</p>}>
        <DynamicContent />
      </Suspense>
    </main>
  )
}
