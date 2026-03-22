import { connection } from 'next/server'
import { Suspense } from 'react'
import Link from 'next/link'

async function PhotoContent({ params }: { params: Promise<{ id: string }> }) {
  // connection() opts this page into dynamic rendering. This is important
  // because the test uses staleTimes.dynamic to control when cache entries
  // expire. Without dynamic rendering, the page would use the static stale
  // time (which is long by default and would mask the bug).
  await connection()
  const { id } = await params
  return <div id="photo-page">Photo {id}</div>
}

export default function PhotoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return (
    <div>
      <Suspense fallback={<div>Loading photo...</div>}>
        <PhotoContent params={params} />
      </Suspense>

      <h2>Step 2: Navigate back</h2>
      <p style={{ color: '#666', fontSize: 14 }}>
        Click this link to go back to the feed page. The route and segment data
        from this page remain in the client cache.
      </p>
      <p>
        <Link href="/feed" prefetch={false} id="link-back-to-feed">
          Back to feed
        </Link>
      </p>
    </div>
  )
}
