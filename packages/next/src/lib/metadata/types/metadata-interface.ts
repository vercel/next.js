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
  ViewportLayout,
} from './extra-types'
import type {
  DeprecatedMetadataFields,
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
  ThemeColorDescriptor,
} from './metadata-types'
import type { Manifest as ManifestFile } from './manifest-types'
import type { OpenGraph, ResolvedOpenGraph } from './opengraph-types'
import type { ResolvedTwitterMetadata, Twitter } from './twitter-types'

/**
 * Metadata interface to describe all the metadata fields that can be set in a document.
 * @interface
 */
interface Metadata extends DeprecatedMetadataFields {
  /**
   * The base path and origin for absolute urls for various metadata links such as OpenGraph images.
   */
  metadataBase?: null | URL

  /**
   * The document title.
   * @example
   * ```tsx
   * "My Blog"
   * <title>My Blog</title>
   *
   * { default: "Dashboard", template: "%s | My Website" }
   * <title>Dashboard | My Website</title>
   *
   * { absolute: "My Blog", template: "%s | My Website" }
   * <title>My Blog</title>
   * ```
   */
  title?: null | string | TemplateString

  /**
   * The document description, and optionally the OpenGraph and twitter descriptions.
   * @example
   * ```tsx
   * "My Blog Description"
   * <meta name="description" content="My Blog Description" />
   * ```
   */
  description?: null | string

  // Standard metadata names
  // https://developer.mozilla.org/docs/Web/HTML/Element/meta/name

  /**
   * The application name.
   * @example
   * ```tsx
   * "My Blog"
   * <meta name="application-name" content="My Blog" />
   * ```
   */
  applicationName?: null | string

  /**
   * The authors of the document.
   * @example
   * ```tsx
   * [{ name: "Next.js Team", url: "https://nextjs.org" }]
   *
   * <meta name="author" content="Next.js Team" />
   * <link rel="author" href="https://nextjs.org" />
   * ```
   */
  authors?: null | Author | Array<Author>

  /**
   * The generator used for the document.
   * @example
   * ```tsx
   * "Next.js"
   *
   * <meta name="generator" content="Next.js" />
   * ```
   */
  generator?: null | string

  /**
   * The keywords for the document. If an array is provided, it will be flattened into a single tag with comma separation.
   * @example
   * ```tsx
   * "nextjs, react, blog"
   * <meta name="keywords" content="nextjs, react, blog" />
   *
   * ["react", "server components"]
   * <meta name="keywords" content="react, server components" />
   * ```
   */
  keywords?: null | string | Array<string>

  /**
   * The referrer setting for the document.
   * @example
   * ```tsx
   * "origin"
   * <meta name="referrer" content="origin" />
   * ```
   */
  referrer?: null | ReferrerEnum

  /**
   * The theme color for the document.
   * @example
   * @deprecated
   *
   * ```tsx
   * "#000000"
   * <meta name="theme-color" content="#000000" />
   *
   * { media: "(prefers-color-scheme: dark)", color: "#000000" }
   * <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000" />
   *
   * [
   *  { media: "(prefers-color-scheme: dark)", color: "#000000" },
   *  { media: "(prefers-color-scheme: light)", color: "#ffffff" }
   * ]
   * <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000" />
   * <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
   * ```
   */
  themeColor?: null | string | ThemeColorDescriptor | ThemeColorDescriptor[]

  /**
   * The color scheme for the document.
   * @example
   * @deprecated
   *
   * ```tsx
   * "dark"
   * <meta name="color-scheme" content="dark" />
   * ```
   */
  colorScheme?: null | ColorSchemeEnum

  /**
   * The viewport setting for the document.
   * @example
   * @deprecated
   *
   * ```tsx
   *
   * { width: "device-width", initialScale: 1 }
   * <meta name="viewport" content="width=device-width, initial-scale=1" />
   * ```
   */
  viewport?: null | string | ViewportLayout

  /**
   * The creator of the document.
   * @example
   * ```tsx
   * "Next.js Team"
   * <meta name="creator" content="Next.js Team" />
   * ```
   */
  creator?: null | string

  /**
   * The publisher of the document.
   * @example
   *
   * ```tsx
   * "Vercel"
   * <meta name="publisher" content="Vercel" />
   * ```
   */
  publisher?: null | string

  // https://developer.mozilla.org/docs/Web/HTML/Element/meta/name#other_metadata_names

  /**
   * The robots setting for the document.
   *
   * @see https://developer.mozilla.org/docs/Glossary/Robots.txt
   * @example
   * ```tsx
   * "index, follow"
   * <meta name="robots" content="index, follow" />
   *
   * { index: false, follow: false }
   * <meta name="robots" content="noindex, nofollow" />
   * ```
   */
  robots?: null | string | Robots

  /**
   * The canonical and alternate URLs for the document.
   * @example
   * ```tsx
   * { canonical: "https://example.com" }
   * <link rel="canonical" href="https://example.com" />
   *
   * { canonical: "https://example.com", hreflang: { "en-US": "https://example.com/en-US" } }
   * <link rel="canonical" href="https://example.com" />
   * <link rel="alternate" href="https://example.com/en-US" hreflang="en-US" />
   * ```
   *
   * Multiple titles example for alternate URLs except `canonical`:
   * ```tsx
   * {
   *   canonical: "https://example.com",
   *   types: {
   *     'application/rss+xml': [
   *       { url: 'blog.rss', title: 'rss' },
   *       { url: 'blog/js.rss', title: 'js title' },
   *     ],
   *   },
   * }
   * <link rel="canonical" href="https://example.com" />
   * <link rel="alternate" href="https://example.com/blog.rss" type="application/rss+xml" title="rss" />
   * <link rel="alternate" href="https://example.com/blog/js.rss" type="application/rss+xml" title="js title" />
   * ```
   */
  alternates?: null | AlternateURLs

  /**
   * The icons for the document. Defaults to rel="icon".
   *
   * @see https://developer.mozilla.org/docs/Web/HTML/Attributes/rel#attr-icon
   * @example
   * ```tsx
   * "https://example.com/icon.png"
   * <link rel="icon" href="https://example.com/icon.png" />
   *
   * { icon: "https://example.com/icon.png", apple: "https://example.com/apple-icon.png" }
   * <link rel="icon" href="https://example.com/icon.png" />
   * <link rel="apple-touch-icon" href="https://example.com/apple-icon.png" />
   *
   * [{ rel: "icon", url: "https://example.com/icon.png" }, { rel: "apple-touch-icon", url: "https://example.com/apple-icon.png" }]
   * <link rel="icon" href="https://example.com/icon.png" />
   * <link rel="apple-touch-icon" href="https://example.com/apple-icon.png" />
   * ```
   */
  icons?: null | IconURL | Array<Icon> | Icons

  /**
   * A web application manifest, as defined in the Web Application Manifest specification.
   *
   * @see https://developer.mozilla.org/docs/Web/Manifest
   * @example
   * ```tsx
   * "https://example.com/manifest.json"
   * <link rel="manifest" href="https://example.com/manifest.json" />
   * ```
   *
   */
  manifest?: null | string | URL

  /**
   * The Open Graph metadata for the document.
   *
   * @see https://ogp.me
   * @example
   * ```tsx
   * {
   *   type: "website",
   *   url: "https://example.com",
   *   title: "My Website",
   *   description: "My Website Description",
   *   siteName: "My Website",
   *   images: [{
   *     url: "https://example.com/og.png",
   *   }],
   * }
   *
   * <meta property="og:type" content="website" />
   * <meta property="og:url" content="https://example.com" />
   * <meta property="og:site_name" content="My Website" />
   * <meta property="og:title" content="My Website" />
   * <meta property="og:description" content="My Website Description" />
   * <meta property="og:image" content="https://example.com/og.png" />
   * ```
   */
  openGraph?: null | OpenGraph

  /**
   * The Twitter metadata for the document.
   * @example
   * ```tsx
   * { card: "summary_large_image", site: "@site", creator: "@creator", "images": "https://example.com/og.png" }
   *
   * <meta name="twitter:card" content="summary_large_image" />
   * <meta name="twitter:site" content="@site" />
   * <meta name="twitter:creator" content="@creator" />
   * <meta name="twitter:title" content="My Website" />
   * <meta name="twitter:description" content="My Website Description" />
   * <meta name="twitter:image" content="https://example.com/og.png" />
   * ```
   *
   */
  twitter?: null | Twitter

  /**
   * The common verification tokens for the document.
   * @example
   * ```tsx
   * { verification: { google: "1234567890", yandex: "1234567890", "me": "1234567890" } }
   * <meta name="google-site-verification" content="1234567890" />
   * <meta name="yandex-verification" content="1234567890" />
   * <meta name="me" content="@me" />
   * ```
   */
  verification?: Verification

  /**
   * The Apple web app metadata for the document.
   *
   * @see https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html
   * @example
   * ```tsx
   * { capable: true, title: "My Website", statusBarStyle: "black-translucent" }
   * <meta name="apple-mobile-web-app-capable" content="yes" />
   * <meta name="apple-mobile-web-app-title" content="My Website" />
   * <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
   * ```
   *
   */
  appleWebApp?: null | boolean | AppleWebApp

  /**
   * Indicates if devices should try to interpret various formats and make actionable links out of them. For example it controles
   * if telephone numbers on mobile that can be clicked to dial or not.
   * @example
   * ```tsx
   * { telephone: false }
   * <meta name="format-detection" content="telephone=no" />
   * ```
   *
   */
  formatDetection?: null | FormatDetection

  /**
   * The metadata for the iTunes App.
   * It adds the `name="apple-itunes-app"` meta tag.
   *
   * @example
   * ```tsx
   * { app: { id: "123456789", affiliateData: "123456789", appArguments: "123456789" } }
   * <meta name="apple-itunes-app" content="app-id=123456789, affiliate-data=123456789, app-arguments=123456789" />
   * ```
   */
  itunes?: null | ItunesApp

  /**
   * A brief description of what this web-page is about. Not recommended, superseded by description.
   * It adds the `name="abstract"` meta tag.
   *
   * @see https://www.metatags.org/all-meta-tags-overview/meta-name-abstract/
   * @example
   * ```tsx
   * "My Website Description"
   * <meta name="abstract" content="My Website Description" />
   * ```
   */
  abstract?: null | string

  /**
   * The Facebook AppLinks metadata for the document.
   * @example
   * ```tsx
   * { ios: { appStoreId: "123456789", url: "https://example.com" }, android: { packageName: "com.example", url: "https://example.com" } }
   *
   * <meta property="al:ios:app_store_id" content="123456789" />
   * <meta property="al:ios:url" content="https://example.com" />
   * <meta property="al:android:package" content="com.example" />
   * <meta property="al:android:url" content="https://example.com" />
   * ```
   */
  appLinks?: null | AppLinks

  /**
   * The archives link rel property.
   * @example
   * ```tsx
   * { archives: "https://example.com/archives" }
   * <link rel="archives" href="https://example.com/archives" />
   * ```
   */
  archives?: null | string | Array<string>

  /**
   * The assets link rel property.
   * @example
   * ```tsx
   * "https://example.com/assets"
   * <link rel="assets" href="https://example.com/assets" />
   * ```
   */
  assets?: null | string | Array<string>

  /**
   * The bookmarks link rel property.
   * @example
   * ```tsx
   * "https://example.com/bookmarks"
   * <link rel="bookmarks" href="https://example.com/bookmarks" />
   * ```
   */
  bookmarks?: null | string | Array<string> // This is technically against HTML spec but is used in wild

  // meta name properties

  /**
   * The category meta name property.
   * @example
   * ```tsx
   * "My Category"
   * <meta name="category" content="My Category" />
   * ```
   */
  category?: null | string

  /**
   * The classification meta name property.
   * @example
   * ```tsx
   * "My Classification"
   * <meta name="classification" content="My Classification" />
   * ```
   */
  classification?: null | string

  /**
   * Arbitrary name/value pairs for the document.
   */
  other?: {
    [name: string]: string | number | Array<string | number>
  } & DeprecatedMetadataFields
}

interface ResolvedMetadata extends DeprecatedMetadataFields {
  // origin and base path for absolute urls for various metadata links such as
  // opengraph-image
  metadataBase: null | URL

  // The Document title and template if defined
  title: null | AbsoluteTemplateString

  // The Document description, and optionally the opengraph and twitter descriptions
  description: null | string

  // Standard metadata names
  // https://developer.mozilla.org/docs/Web/HTML/Element/meta/name
  applicationName: null | string
  authors: null | Array<Author>
  generator: null | string
  // if you provide an array it will be flattened into a single tag with comma separation
  keywords: null | Array<string>
  referrer: null | ReferrerEnum
  /**
   * @deprecated
   */
  themeColor: null | ThemeColorDescriptor[]
  /**
   * @deprecated
   */
  colorScheme: null | ColorSchemeEnum
  /**
   * @deprecated
   */
  viewport: null | string
  creator: null | string
  publisher: null | string

  // https://developer.mozilla.org/docs/Web/HTML/Element/meta/name#other_metadata_names
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
  other:
    | null
    | ({
        [name: string]: string | number | Array<string | number>
      } & DeprecatedMetadataFields)
}

type RobotsFile = {
  // Apply rules for all
  rules:
    | {
        userAgent?: string | string[]
        allow?: string | string[]
        disallow?: string | string[]
        crawlDelay?: number
      }
    // Apply rules for specific user agents
    | Array<{
        userAgent: string | string[]
        allow?: string | string[]
        disallow?: string | string[]
        crawlDelay?: number
      }>
  sitemap?: string | string[]
  host?: string
}

type SitemapFile = Array<{
  url: string
  lastModified?: string | Date
  changeFrequency?:
    | 'always'
    | 'hourly'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | 'never'
  priority?: number
}>

type ResolvingMetadata = Promise<ResolvedMetadata>
declare namespace MetadataRoute {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  export type Robots = RobotsFile
  export type Sitemap = SitemapFile
  export type Manifest = ManifestFile
}

interface Viewport extends ViewportLayout {
  /**
   * The theme color for the document.
   * @example
   *
   * ```tsx
   * "#000000"
   * <meta name="theme-color" content="#000000" />
   *
   * { media: "(prefers-color-scheme: dark)", color: "#000000" }
   * <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000" />
   *
   * [
   *  { media: "(prefers-color-scheme: dark)", color: "#000000" },
   *  { media: "(prefers-color-scheme: light)", color: "#ffffff" }
   * ]
   * <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000" />
   * <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
   * ```
   */
  themeColor?: null | string | ThemeColorDescriptor | ThemeColorDescriptor[]

  /**
   * The color scheme for the document.
   * @example
   *
   * ```tsx
   * "dark"
   * <meta name="color-scheme" content="dark" />
   * ```
   */
  colorScheme?: null | ColorSchemeEnum
}

type ResolvingViewport = Promise<Viewport>

interface ResolvedViewport extends ViewportLayout {
  themeColor: null | ThemeColorDescriptor[]
  colorScheme: null | ColorSchemeEnum
}

export type {
  Metadata,
  ResolvedMetadata,
  ResolvingMetadata,
  MetadataRoute,
  Viewport,
  ResolvingViewport,
  ResolvedViewport,
}
