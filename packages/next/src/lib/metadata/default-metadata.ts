import type { ResolvedMetadata } from './types/metadata-interface'

export const createDefaultMetadata = (): ResolvedMetadata => {
  return {
    viewport: 'width=device-width, initial-scale=1',

    // Other values are all null
    metadataBase: null,
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
