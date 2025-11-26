/**
 *
 * Metadata types
 *
 */

export interface DeprecatedMetadataFields {
  /**
   * Deprecated options that have a preferred method
   * @deprecated Use appleWebApp instead
   */
  'apple-touch-fullscreen'?: never | undefined

  /**
   * Obsolete since iOS 7.
   * @see https://web.dev/apple-touch-icon/
   * @deprecated Use icons.apple instead
   */
  'apple-touch-icon-precomposed'?: never | undefined
}

export type TemplateString =
  | DefaultTemplateString
  | AbsoluteTemplateString
  | AbsoluteString
export type DefaultTemplateString = {
  default: string
  template: string
}
export type AbsoluteTemplateString = {
  absolute: string
  template: string | null
}
export type AbsoluteString = {
  absolute: string
}

export type Author = {
  // renders as <link rel="author"...
  url?: string | URL | undefined
  // renders as <meta name="author"...
  name?: string | undefined
}

// does not include "unsafe-URL". to use this users should
// use '"unsafe-URL" as ReferrerEnum'
export type ReferrerEnum =
  | 'no-referrer'
  | 'origin'
  | 'no-referrer-when-downgrade'
  | 'origin-when-cross-origin'
  | 'same-origin'
  | 'strict-origin'
  | 'strict-origin-when-cross-origin'

export type ColorSchemeEnum =
  | 'normal'
  | 'light'
  | 'dark'
  | 'light dark'
  | 'dark light'
  | 'only light'

type RobotsInfo = {
  // all and none will be inferred from index/follow boolean options
  index?: boolean | undefined
  follow?: boolean | undefined

  /** @deprecated set index to false instead */
  noindex?: never | undefined
  /** @deprecated set follow to false instead */
  nofollow?: never | undefined

  noarchive?: boolean | undefined
  nosnippet?: boolean | undefined
  noimageindex?: boolean | undefined
  nocache?: boolean | undefined
  notranslate?: boolean | undefined
  indexifembedded?: boolean | undefined
  nositelinkssearchbox?: boolean | undefined
  unavailable_after?: string | undefined
  'max-video-preview'?: number | string | undefined
  'max-image-preview'?: 'none' | 'standard' | 'large' | undefined
  'max-snippet'?: number | undefined
}
export type Robots = RobotsInfo & {
  // if you want to specify an alternate robots just for google
  googleBot?: string | RobotsInfo | undefined
}

export type ResolvedRobots = {
  basic: string | null
  googleBot: string | null
}

export type IconURL = string | URL
export type Icon = IconURL | IconDescriptor
export type IconDescriptor = {
  url: string | URL
  type?: string | undefined
  sizes?: string | undefined
  color?: string | undefined
  /** defaults to rel="icon" unless superseded by Icons map */
  rel?: string | undefined
  media?: string | undefined
  /**
   * @see https://developer.mozilla.org/docs/Web/API/HTMLImageElement/fetchPriority
   */
  fetchPriority?: 'high' | 'low' | 'auto' | undefined
}

export type Icons = {
  /** rel="icon" */
  icon?: Icon | Icon[] | undefined
  /** rel="shortcut icon" */
  shortcut?: Icon | Icon[] | undefined
  /**
   * @see https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html
   * rel="apple-touch-icon"
   */
  apple?: Icon | Icon[] | undefined
  /** rel inferred from descriptor, defaults to "icon" */
  other?: IconDescriptor | IconDescriptor[] | undefined
}

export type Verification = {
  google?: null | string | number | (string | number)[] | undefined
  yahoo?: null | string | number | (string | number)[] | undefined
  yandex?: null | string | number | (string | number)[] | undefined
  me?: null | string | number | (string | number)[] | undefined
  // if you ad-hoc additional verification
  other?:
    | {
        [name: string]: string | number | (string | number)[]
      }
    | undefined
}

export type ResolvedVerification = {
  google?: null | (string | number)[] | undefined
  yahoo?: null | (string | number)[] | undefined
  yandex?: null | (string | number)[] | undefined
  me?: null | (string | number)[] | undefined
  other?:
    | {
        [name: string]: (string | number)[]
      }
    | undefined
}

export type ResolvedIcons = {
  icon: IconDescriptor[]
  apple: IconDescriptor[]
  shortcut?: IconDescriptor[] | undefined
  other?: IconDescriptor[] | undefined
}

export type ThemeColorDescriptor = {
  color: string
  media?: string | undefined
}

export type Restriction = {
  relationship: 'allow' | 'deny'
  content: string
}

export type Videos = {
  title: string
  thumbnail_loc: string
  description: string
  content_loc?: string | undefined
  player_loc?: string | undefined
  duration?: number | undefined
  expiration_date?: Date | string | undefined
  rating?: number | undefined
  view_count?: number | undefined
  publication_date?: Date | string | undefined
  family_friendly?: 'yes' | 'no' | undefined
  restriction?: Restriction | undefined
  platform?: Restriction | undefined
  requires_subscription?: 'yes' | 'no' | undefined
  uploader?:
    | {
        info?: string | undefined
        content?: string | undefined
      }
    | undefined
  live?: 'yes' | 'no' | undefined
  tag?: string | undefined
}
