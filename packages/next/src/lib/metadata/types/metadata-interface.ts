import type {
  AlternateURLs,
  ResolvedAlternateURLs,
} from './alternative-urls-types'
import type {
  AppleWebApp,
  AppLinks,
  FormatDetection,
  ItunesApp,
  ResolvedAppleWebApp,
  ResolvedAppLinks,
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
  ResolvedVerification,
  Robots,
  ResolvedRobots,
  TemplateString,
  Verification,
} from './metadata-types'
import type { OpenGraph, ResolvedOpenGraph } from './opengraph-types'
import type { ResolvedTwitterMetadata, Twitter } from './twitter-types'

/**
 * Metadata interface to describe all the metadata fields that can be set in a document.
 * @interface
 */
interface Metadata {
  /**
   * The base path and origin for absolute urls for various metadata links such as OpenGraph images.
   * @type {null | URL}
   */
  metadataBase?: null | URL

  /**
   * The document title.
   * @type {null | string | TemplateString}
   */
  title?: null | string | TemplateString

  /**
   * The document description, and optionally the OpenGraph and twitter descriptions.
   * @type {null | string}
   */
  description?: null | string

  // Standard metadata names
  // https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name

  /**
   * The application name.
   * @type {null | string}
   */
  applicationName?: null | string

  /**
   * The authors of the document.
   * @type {null | Author | Array<Author>}
   */
  authors?: null | Author | Array<Author>

  /**
   * The generator used for the document.
   * @type {null | string}
   */
  generator?: null | string

  /**
   * The keywords for the document. If an array is provided, it will be flattened into a single tag with comma separation.
   * @type {null | string | Array<string>}
   */
  keywords?: null | string | Array<string>

  /**
   * The referrer setting for the document.
   * @type {null | ReferrerEnum}
   */
  referrer?: null | ReferrerEnum

  /**
   * The theme color for the document.
   * @type {null | string}
   */
  themeColor?: null | string

  /**
   * The color scheme for the document.
   * @type {null | ColorSchemeEnum}
   */
  colorScheme?: null | ColorSchemeEnum

  /**
   * The viewport setting for the document.
   * @type {null | string | Viewport}
   */
  viewport?: null | string | Viewport

  /**
   * The creator of the document.
   * @type {null | string}
   */
  creator?: null | string

  /**
   * The publisher of the document.
   * @type {null | string}
   */
  publisher?: null | string

  // https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name#other_metadata_names

  /**
   * The robots setting for the document.
   * @type {null | string | Robots}
   */
  robots?: null | string | Robots

  /**
   * The canonical and alternate URLs for the document.
   * @type {null | AlternateURLs}
   */
  alternates?: null | AlternateURLs

  /**
   * The icons for the document. Defaults to rel="icon".
   * @type {null | IconURL | Array<Icon> | Icons}
   */
  icons?: null | IconURL | Array<Icon> | Icons

  /**
   * The manifest.json file is the only file that every extension using WebExtension APIs must contain
   *
   * @type {null | string | URL}
   */
  manifest?: null | string | URL

  /**
   * @example
   * Example of Open Graph field:
   * ```
   * {
   *   type: "website",
   *   url: "https://example.com",
   *   siteName: "My Website",
   *   title: "My Website",
   *   images: [{
   *     url: "https://example.com/og.png",
   *   }],
   * }
   * ```
   */
  openGraph?: null | OpenGraph

  /**
   * The Twitter metadata for the document.
   * @type {null | Twitter}
   */
  twitter?: null | Twitter

  /**
   * The common verification tokens for the document.
   * @type {Verification}
   */
  verification?: Verification

  /**
   * The Apple web app metadata for the document.
   * https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html
   * @type {null | boolean | AppleWebApp}
   */
  appleWebApp?: null | boolean | AppleWebApp

  /**
   * Indicates if devices should try to interpret various formats and make actionable links out of them. For example it controles
   * if telephone numbers on mobile that can be clicked to dial or not.
   * @type {null | FormatDetection}
   */
  formatDetection?: null | FormatDetection

  /**
   * The metadata for the iTunes App.
   * It adds the `name="apple-itunes-app"` meta tag.
   * @type {null | ItunesApp}
   */
  itunes?: null | ItunesApp

  /**
   * A brief description of what this web-page is about. Not recommended, superceded by description.
   * It adds the `name="abstract"` meta tag.
   * https://www.metatags.org/all-meta-tags-overview/meta-name-abstract/
   * @type {null | string}
   */
  abstract?: null | string

  /**
   * The Facebook AppLinks metadata for the document.
   * @type {null | AppLinks}
   */
  appLinks?: null | AppLinks

  /**
   * The archives link rel property.
   * @type {null | string | Array<string>}
   */
  archives?: null | string | Array<string>

  /**
   * The assets link rel property.
   * @type {null | string | Array<string>}
   */
  assets?: null | string | Array<string>

  /**
   * The bookmarks link rel property.
   * @type {null | string | Array<string>}
   */
  bookmarks?: null | string | Array<string> // This is technically against HTML spec but is used in wild

  // meta name properties

  /**
   * The category meta name property.
   * @type {null | string}
   */
  category?: null | string

  /**
   * The classification meta name property.
   * @type {null | string}
   */
  classification?: null | string

  /**
   * Arbitrary name/value pairs for the document.
   * @type {{ [name: string]: string | number | Array<string | number> }}
   */
  other?: {
    [name: string]: string | number | Array<string | number>
  }

  /**
   * Deprecated options that have a preferred method.
   * Use appWebApp to configure apple-mobile-web-app-capable which provides
   * https://www.appsloveworld.com/coding/iphone/11/difference-between-apple-mobile-web-app-capable-and-apple-touch-fullscreen-ipho
   * @deprecated
   */
  'apple-touch-fullscreen'?: never

  /**
   * Deprecated options that have a preferred method.
   * Obsolete since iOS 7. use icons.apple or "app-touch-icon" instead
   * https://web.dev/apple-touch-icon/
   * @deprecated
   */
  'apple-touch-icon-precomposed'?: never
}

interface ResolvedMetadata {
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
  robots: null | ResolvedRobots

  // The canonical and alternate URLs for this location
  alternates: null | ResolvedAlternateURLs

  // Defaults to rel="icon" but the Icons type can be used
  // to get more specific about rel types
  icons: null | ResolvedIcons

  openGraph: null | ResolvedOpenGraph

  manifest: null | string | URL

  twitter: null | ResolvedTwitterMetadata

  // common verification tokens
  verification: null | ResolvedVerification

  // Apple web app metadata
  // https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html
  appleWebApp: null | ResolvedAppleWebApp

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
  appLinks: null | ResolvedAppLinks

  // link rel properties
  archives: null | Array<string>
  assets: null | Array<string>
  bookmarks: null | Array<string> // This is technically against HTML spec but is used in wild

  // meta name properties
  category: null | string
  classification: null | string

  // Arbitrary name/value pairs
  other: null | {
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
export { Metadata, ResolvedMetadata }
