import { Metadata } from 'next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  'use cache: remote'

  // We're reading params here. This makes the cache function dynamic during
  // prerendering, and thus the description should be excluded from the
  // partially prerendered page.
  const { slug } = await params

  return { description: new Date().toISOString(), category: slug }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>
}
