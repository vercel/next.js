import type {
  ResolvedMetadata,
  ResolvedScreenMetadata,
} from './types/metadata-interface'

export function createDefaultScreenMetadata(): ResolvedScreenMetadata {
  return {
    viewport: {
      width: 'device-width',
      initialScale: 1,
    },
    themeColor: null,
    colorScheme: null,
  }
}

export function createDefaultMetadata(): ResolvedMetadata {
  return {
    // Deprecated ones
    viewport: null,
    themeColor: null,
    colorScheme: null,

    metadataBase: null,
    // Other values are all null
    title: null,
    description: null,
    applicationName: null,
    authors: null,
    generator: null,
    keywords: null,
    referrer: null,
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
