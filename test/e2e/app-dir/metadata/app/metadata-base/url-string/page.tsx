import { Metadata, ResolvingMetadata } from 'next'

export default function Page() {
  return null
}

export async function generateMetadata(
  _props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const parentMetadata = await parent

  return {
    // Always return a string, to verify that this is also supported.
    metadataBase: (typeof parentMetadata.metadataBase === 'string'
      ? parentMetadata.metadataBase
      : parentMetadata.metadataBase?.href
    )?.replace('base', ''),
    alternates: { canonical: '/metadata-base/url-string' },
  }
}
