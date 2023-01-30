import z from 'next/dist/compiled/zod'

import { AlternateURLsSchema, ResolvedAlternateURLsSchema } from './alternative-urls-types'
import {
  AppleWebAppSchema,
  AppLinksSchema,
  FormatDetectionSchema,
  ItunesAppSchema,
  ResolvedAppleWebAppSchema,
  ResolvedAppLinksSchema,
  ViewportSchema,
} from './extra-types'
import {
  TemplateStringSchema,
  AuthorSchema,
  ReferrerEnumSchema,
  ColorSchemeEnumSchema,
  RobotsSchema,
  IconSchema,
  IconsSchema,
  IconURLSchema,
  VerificationSchema,
  AbsoluteTemplateStringSchema,
  ResolvedRobotsSchema,
  ResolvedIconsSchema,
  ResolvedVerificationSchema,
} from './metadata-types'
import { OpenGraphSchema, ResolvedOpenGraphSchema } from './opengraph-types'
import { ResolvedTwitterMetadataSchema, TwitterSchema } from './twitter-types'

const MetadataSchema = z.object({
  /**
   * Origin and base path for absolute urls for various metadata links such as
   * OpenGraph image.
   */
  metadataBase: z.union([z.null(), z.instanceof(URL)]),

  /**
   * The document title.
   */
  title: z.union([z.null(), z.string(), TemplateStringSchema]).optional(),

  /**
   * The document description, and optionally the OpenGraph and Twitter descriptions.
   */
  description: z.union([z.null(), z.string()]).optional(),

  // Standard metadata names
  // https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name
  applicationName: z.union([z.null(), z.string()]).optional(),
  authors: z.union([z.null(), AuthorSchema, z.array(AuthorSchema)]).optional(),
  generator: z.union([z.null(), z.string()]).optional(),

  // if you provide an array it will be flattened into a single tag with comma separation
  keywords: z.union([z.null(), z.string(), z.array(z.string())]).optional(),
  referrer: z.union([z.null(), ReferrerEnumSchema]).optional(),
  themeColor: z.union([z.null(), z.string()]).optional(),
  colorScheme: z.union([z.null(), ColorSchemeEnumSchema]).optional(),
  viewport: z.union([z.null(), z.string(), ViewportSchema]).optional(),
  creator: z.union([z.null(), z.string()]).optional(),
  publisher: z.union([z.null(), z.string()]).optional(),

  // https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name#other_metadata_names
  robots: z.union([z.null(), z.string(), RobotsSchema]).optional(),

  // The canonical and alternate URLs for this location
  alternates: z.union([z.null(), AlternateURLsSchema]).optional(),

  // Defaults to rel="icon" but the Icons type can be used
  // to get more specific about rel types
  icons: z.union([z.null(), IconURLSchema, z.array(IconSchema), IconsSchema]).optional(),

  openGraph: z.union([z.null(), OpenGraphSchema]).optional(),

  twitter: z.union([z.null(), TwitterSchema]).optional(),

  // common verification tokens
  verification: VerificationSchema.optional(),

  // Apple web app metadata
  // https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html
  appleWebApp: z.union([z.null(), z.boolean(), AppleWebAppSchema]).optional(),

  // Should devices try to interpret various formats and make actionable links
  // out of them? The canonical example is telephone numbers on mobile that can
  // be clicked to dial
  formatDetection: z.union([z.null(), FormatDetectionSchema]).optional(),

  // meta name="apple-itunes-app"
  itunes: z.union([z.null(), ItunesAppSchema]).optional(),

  // meta name="abstract"
  // A brief description of what this web-page is about.
  // Not recommended, superceded by description.
  // https://www.metatags.org/all-meta-tags-overview/meta-name-abstract/
  abstract: z.union([z.null(), z.string()]).optional(),

  // Facebook AppLinks
  appLinks: z.union([z.null(), AppLinksSchema]).optional(),

  // link rel properties
  archives: z.union([z.null(), z.string(), z.array(z.string())]).optional(),
  assets: z.union([z.null(), z.string(), z.array(z.string())]).optional(),
  // This is technically against HTML spec but is used in wild
  bookmarks: z.union([z.null(), z.string(), z.array(z.string())]).optional(),

  // meta name properties
  category: z.union([z.null(), z.string()]).optional(),
  classification: z.union([z.null(), z.string()]).optional(),

  // Arbitrary name/value pairs
  other: z.record(z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])).optional(),

  /**
   *  Deprecated options that have a preferred method
   * */
  // Use appWebApp to configure apple-mobile-web-app-capable which provides
  // https://www.appsloveworld.com/coding/iphone/11/difference-between-apple-mobile-web-app-capable-and-apple-touch-fullscreen-ipho
  /**
   * @deprecated
   */
  'apple-touch-fullscreen': z.never().optional(),

  // Obsolete since iOS 7. use icons.apple or "app-touch-icon" instead
  // https://web.dev/apple-touch-icon/
  /**
   * @deprecated
   */
  'apple-touch-icon-precomposed': z.never().optional(),
})

const ResolvedMetadataSchema = z.object({
  // origin and base path for absolute urls for various metadata links such as
  // opengraph-image
  metadataBase: z.union([z.null(), z.instanceof(URL)]),

  // The Document title and template if defined
  title: z.union([z.null(), AbsoluteTemplateStringSchema]),

  // The Document description, and optionally the opengraph and twitter descriptions
  description: z.union([z.null(), z.string()]),

  // Standard metadata names
  // https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name
  applicationName: z.union([z.null(), z.string()]),
  authors: z.union([z.null(), z.array(AuthorSchema)]),
  generator: z.union([z.null(), z.string()]),
  // if you provide an array it will be flattened into a single tag with comma separation
  keywords: z.union([z.null(), z.array(z.string())]),
  referrer: z.union([z.null(), ReferrerEnumSchema]),
  themeColor: z.union([z.null(), z.string()]),
  colorScheme: z.union([z.null(), ColorSchemeEnumSchema]),
  viewport: z.union([z.null(), z.string()]),
  creator: z.union([z.null(), z.string()]),
  publisher: z.union([z.null(), z.string()]),

  // https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name#other_metadata_names
  robots: z.union([z.null(), ResolvedRobotsSchema]),

  // The canonical and alternate URLs for this location
  alternates: z.union([z.null(), ResolvedAlternateURLsSchema]),

  // Defaults to rel="icon" but the Icons type can be used
  // to get more specific about rel types
  icons: z.union([z.null(), ResolvedIconsSchema]),

  openGraph: z.union([z.null(), ResolvedOpenGraphSchema]),

  twitter: z.union([z.null(), ResolvedTwitterMetadataSchema]),

  // common verification tokens
  verification: z.union([z.null(), ResolvedVerificationSchema]),

  // Apple web app metadata
  // https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html
  appleWebApp: z.union([z.null(), ResolvedAppleWebAppSchema]),

  // Should devices try to interpret various formats and make actionable links
  // out of them? The canonical example is telephone numbers on mobile that can
  // be clicked to dial
  formatDetection: z.union([z.null(), FormatDetectionSchema]),

  // meta name="apple-itunes-app"
  itunes: z.union([z.null(), ItunesAppSchema]),

  // meta name="abstract"
  // A brief description of what this web-page is about.
  // Not recommended, superceded by description.
  // https://www.metatags.org/all-meta-tags-overview/meta-name-abstract/
  abstract: z.union([z.null(), z.string()]),

  // Facebook AppLinks
  appLinks: z.union([z.null(), ResolvedAppLinksSchema]),

  // link rel properties
  archives: z.union([z.null(), z.array(z.string())]),
  assets: z.union([z.null(), z.array(z.string())]),
  // This is technically against HTML spec but is used in wild
  bookmarks: z.union([z.null(), z.array(z.string())]),

  // meta name properties
  category: z.union([z.null(), z.string()]),
  classification: z.union([z.null(), z.string()]),

  // Arbitrary name/value pairs
  other: z.record(z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])),

  /**
   *  Deprecated options that have a preferred method
   * */
  // Use appWebApp to configure apple-mobile-web-app-capable which provides
  // https://www.appsloveworld.com/coding/iphone/11/difference-between-apple-mobile-web-app-capable-and-apple-touch-fullscreen-ipho
  /**
   * @deprecated
   */
  'apple-touch-fullscreen': z.never().optional(),

  // Obsolete since iOS 7. use icons.apple or "app-touch-icon" instead
  // https://web.dev/apple-touch-icon/
  /**
   * @deprecated
   */
  'apple-touch-icon-precomposed': z.never().optional(),
})

// Types
export type ResolvedMetadata = z.infer<typeof ResolvedMetadataSchema>
export type ResolvingMetadata = Promise<ResolvedMetadata>
export type Metadata = z.infer<typeof MetadataSchema>
