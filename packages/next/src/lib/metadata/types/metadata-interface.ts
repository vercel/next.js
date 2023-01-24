import type {
  AlternateURLs,
  ResolvedAlternateURLs,
} from './alternative-urls-types'
import type {
  AppleWebApp,
  AppLinks,
  FormatDetection,
  ItunesApp,
  Viewport,
} from './extra-types'
import type {
  AbsoluteTemplateString,
  Author,
  ColorSchemeEnum,
  Icon,
  Icons,
  IconURL,
  ReferrerEnum,
  ResolvedIcons,
  Robots,
  TemplateString,
  Verification,
} from './metadata-types'
import type { OpenGraph, ResolvedOpenGraph } from './opengraph-types'
import { ResolvedTwitterMetadata, Twitter } from './twitter-types'

export interface Metadata {
  // origin and base path for absolute urls for various metadata links such as
  // opengraph-image
  metadataBase: null | URL

  // The Document title
  title?: null | string | TemplateString

  // The Document description, and optionally the opengraph and twitter descriptions
  description?: null | string

  // Standard metadata names
  // https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name
  applicationName?: null | string | Array<string>
  authors?: null | Author | Array<Author>
  generator?: null | string
  // if you provide an array it will be flattened into a single tag with comma separation
  keywords?: null | string | Array<string>
  referrer?: null | ReferrerEnum
  themeColor?: null | string
  colorScheme?: null | ColorSchemeEnum
  viewport?: null | string | Viewport
  creator?: null | string
  publisher?: null | string

  // https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name#other_metadata_names
  robots?: null | string | Robots

  // The canonical and alternate URLs for this location
  alternates: AlternateURLs

  // Defaults to rel="icon" but the Icons type can be used
  // to get more specific about rel types
  icons?: null | IconURL | Array<Icon> | Icons

  openGraph?: null | OpenGraph

  twitter?: null | Twitter

  // common verification tokens
  verification?: Verification

  // Apple web app metadata
  // https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html
  appleWebApp?: null | boolean | AppleWebApp

  // Should devices try to interpret various formats and make actionable links
  // out of them? The canonical example is telephone numbers on mobile that can
  // be clicked to dial
  formatDetection?: null | FormatDetection

  // meta name="apple-itunes-app"
  itunes?: null | ItunesApp

  // meta name="abstract"
  // A brief description of what this web-page is about.
  // Not recommended, superceded by description.
  // https://www.metatags.org/all-meta-tags-overview/meta-name-abstract/
  abstract?: null | string

  // Facebook AppLinks
  appLinks?: null | AppLinks

  // link rel properties
  archives?: null | string | Array<string>
  assets?: null | string | Array<string>
  bookmarks?: null | string | Array<string> // This is technically against HTML spec but is used in wild

  // meta name properties
  category?: null | string
  classification?: null | string

  // Arbitrary name/value pairs
  other?: {
    [name: string]: string | number | Array<string | number>
  }

  /**
   *  Deprecated options that have a preferred method
   * */
  // Use appWebApp to configure apple-mobile-web-app-capable which provides
  // https://www.appsloveworld.com/coding/iphone/11/difference-between-apple-mobile-web-app-capable-and-apple-touch-fullscreen-ipho
  'apple-touch-fullscreen'?: never

  // Obsolete since iOS 7. use icons.apple or "app-touch-icon" instead
  // https://web.dev/apple-touch-icon/
  'apple-touch-icon-precomposed'?: never
}

export interface ResolvedMetadata {
  // origin and base path for absolute urls for various metadata links such as
  // opengraph-image
  metadataBase: null | URL

  // The Document title and template if defined
  title: null | AbsoluteTemplateString

  // The Document description, and optionally the opengraph and twitter descriptions
  description: null | string

  // Standard metadata names
  // https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name
  applicationName: null | string
  authors: null | Array<Author>
  generator: null | string
  // if you provide an array it will be flattened into a single tag with comma separation
  keywords: null | Array<string>
  referrer: null | ReferrerEnum
  themeColor: null | string
  colorScheme: null | ColorSchemeEnum
  viewport: null | string
  creator: null | string
  publisher: null | string

  // https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name#other_metadata_names
  robots: null | string

  // The canonical and alternate URLs for this location
  alternates: ResolvedAlternateURLs

  // Defaults to rel="icon" but the Icons type can be used
  // to get more specific about rel types
  icons: null | ResolvedIcons

  openGraph: null | ResolvedOpenGraph

  twitter: null | ResolvedTwitterMetadata

  // common verification tokens
  verification: Verification

  // Apple web app metadata
  // https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html
  appleWebApp: null | AppleWebApp

  // Should devices try to interpret various formats and make actionable links
  // out of them? The canonical example is telephone numbers on mobile that can
  // be clicked to dial
  formatDetection: null | FormatDetection

  // meta name="apple-itunes-app"
  itunes: null | ItunesApp

  // meta name="abstract"
  // A brief description of what this web-page is about.
  // Not recommended, superceded by description.
  // https://www.metatags.org/all-meta-tags-overview/meta-name-abstract/
  abstract: null | string

  // Facebook AppLinks
  appLinks: null | AppLinks

  // link rel properties
  archives: null | Array<string>
  assets: null | Array<string>
  bookmarks: null | Array<string> // This is technically against HTML spec but is used in wild

  // meta name properties
  category: null | string
  classification: null | string

  // Arbitrary name/value pairs
  other: {
    [name: string]: string | number | Array<string | number>
  }

  /**
   *  Deprecated options that have a preferred method
   * */
  // Use appWebApp to configure apple-mobile-web-app-capable which provides
  // https://www.appsloveworld.com/coding/iphone/11/difference-between-apple-mobile-web-app-capable-and-apple-touch-fullscreen-ipho
  'apple-touch-fullscreen'?: never

  // Obsolete since iOS 7. use icons.apple or "app-touch-icon" instead
  // https://web.dev/apple-touch-icon/
  'apple-touch-icon-precomposed'?: never
}

export type ResolvingMetadata = Promise<ResolvedMetadata>
