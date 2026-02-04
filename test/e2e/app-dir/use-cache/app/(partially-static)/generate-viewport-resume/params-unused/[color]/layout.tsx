import { Viewport } from 'next'

export async function generateViewport({
  params,
}: {
  params: Promise<{ color: string }>
}): Promise<Viewport> {
  'use cache'

  // Explicitly not reading params here. The meta tag should appear in the
  // partially prerendered page. TODO: When resuming the page, we should get a
  // cache hit (from the RDC), but omitting unused params from cache keys (and
  // upgrading cache keys when they are used) is not yet implemented.

  return { maximumScale: 1 + Math.random() }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>
}
