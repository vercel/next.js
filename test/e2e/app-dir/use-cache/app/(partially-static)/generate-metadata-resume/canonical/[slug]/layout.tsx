import { Metadata, ResolvingMetadata } from 'next'

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
    // We can not return a URL instance from a `'use cache'` function.
    metadataBase: metadataBase?.replace('/foo', '/bar'),
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
