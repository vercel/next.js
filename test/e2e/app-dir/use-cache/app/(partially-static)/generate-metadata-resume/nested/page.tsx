import { Metadata, ResolvingMetadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'

export async function generateMetadata(
  _: { searchParams: Promise<Record<string, string | string[] | undefined>> },
  parent: ResolvingMetadata
): Promise<Metadata> {
  'use cache'

  // Explicitly not reading search params here. The search params should be
  // omitted from the cache key, so that we ensure a cache hit when resuming the
  // partially prerendered page.

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
