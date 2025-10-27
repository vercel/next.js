import { Metadata, ResolvingMetadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'

export async function generateMetadata(
  _: { params: Promise<{ slug: string }> },
  parent: ResolvingMetadata
): Promise<Metadata> {
  'use cache'

  // We're not reading params here, but we do define a canonical URL, which
  // leads to the pathname being read under the hood. This should make the
  // function dynamic when prerendering the fallback shell, and not lead to a
  // timeout error.

  const { metadataBase } = await parent

  return {
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
