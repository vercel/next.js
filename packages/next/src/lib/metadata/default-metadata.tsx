import type { ResolvedMetadata } from './types/metadata-interface'

export function createDefaultMetadata(): ResolvedMetadata {
  let defaultMetadataBase =
    process.env.NODE_ENV === 'production' && process.env.VERCEL_URL
      ? new URL(`https://${process.env.VERCEL_URL}`)
      : null

  return {
    viewport: 'width=device-width, initial-scale=1',
    metadataBase: defaultMetadataBase,

    // Other values are all null
    title: null,
    description: null,
    applicationName: null,
    authors: null,
    generator: null,
    keywords: null,
    referrer: null,
    themeColor: null,
    colorScheme: null,
    creator: null,
    publisher: null,
    robots: null,
    manifest: null,
    alternates: {
      canonical: null,
      languages: null,
      media: null,
      types: null,
    },
    icons: null,
    openGraph: null,
    twitter: null,
    verification: {},
    appleWebApp: null,
    formatDetection: null,
    itunes: null,
    abstract: null,
    appLinks: null,
    archives: null,
    assets: null,
    bookmarks: null,
    category: null,
    classification: null,
    other: {},
  }
}
