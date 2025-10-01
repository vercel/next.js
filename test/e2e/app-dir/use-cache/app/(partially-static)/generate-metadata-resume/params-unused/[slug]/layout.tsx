import { Metadata } from 'next'

export async function generateMetadata(_: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  'use cache'

  // Explicitly not reading params here. The description should appear in the
  // partially prerendered page. TODO: When resuming the page, we should get a
  // cache hit (from the RDC), but omitting unused params from cache keys (and
  // upgrading cache keys when they are used) is not yet implemented.

  return { description: new Date().toISOString() }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
