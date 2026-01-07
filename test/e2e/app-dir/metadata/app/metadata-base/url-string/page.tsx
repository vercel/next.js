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
    metadataBase: parentMetadata.metadataBase?.replace('base', 'case'),
    alternates: { canonical: '/metadata-base/url-string' },
  }
}
