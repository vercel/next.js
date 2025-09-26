import { Metadata, ResolvingMetadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
  parent: ResolvingMetadata
): Promise<Metadata> {
  'use cache'

  // Explicitly not reading params here. The title should appear in the
  // partially prerendered page. TODO: When resuming the page, we should get a
  // cache hit (from the RDC), but omitting unused params from cache keys (and
  // upgrading cache keys when they are used) is not yet implemented.

  const { metadataBase } = await parent

  return {
    title: new Date().toISOString(),
    metadataBase: metadataBase?.replace('/bar', '/baz'),
    alternates: { canonical: '/qux' },
  }
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Dynamic />
    </Suspense>
  )
}

async function Dynamic() {
  await connection()

  return <p>Dynamic</p>
}
