import { Metadata, ResolvingMetadata } from 'next'

export async function generateMetadata(
  _: {},
  parent: ResolvingMetadata
): Promise<Metadata> {
  'use cache'

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
