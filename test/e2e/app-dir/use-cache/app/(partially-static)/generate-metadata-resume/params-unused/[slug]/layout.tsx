import { Metadata, ResolvingMetadata } from 'next'

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
  parent: ResolvingMetadata
): Promise<Metadata> {
  'use cache'

  // Explicitly not reading params here. The description should appear in the
  // partially prerendered page. TODO: When resuming the page, we should get a
  // cache hit (from the RDC), but omitting unused params from cache keys (and
  // upgrading cache keys when they are used) is not yet implemented.

  const { metadataBase } = await parent

  return {
    description: new Date().toISOString(),
    // We can not return a URL instance from a `'use cache'` function.
    metadataBase: metadataBase?.replace('/foo', '/bar'),
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
