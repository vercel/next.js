/**
 *
 * Metadata types
 *
 */

export interface DeprecatedMetadataFields {
  /**
   * Deprecated options that have a preferred method
   * @deprecated Use appWebApp to configure apple-mobile-web-app-capable which provides
   * @see https://www.appsloveworld.com/coding/iphone/11/difference-between-apple-mobile-web-app-capable-and-apple-touch-fullscreen-ipho
   */
  'apple-touch-fullscreen'?: never

  /**
   * Obsolete since iOS 7.
   * @see https://web.dev/apple-touch-icon/
   * @deprecated use icons.apple or instead
   */
  'apple-touch-icon-precomposed'?: never
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
  url?: string | URL
  // renders as <meta name="author"...
  name?: string
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
  index?: boolean
  follow?: boolean

  /** @deprecated set index to false instead */
  noindex?: never
  /** @deprecated set follow to false instead */
  nofollow?: never

  noarchive?: boolean
  nosnippet?: boolean
  noimageindex?: boolean
  nocache?: boolean
  notranslate?: boolean
  indexifembedded?: boolean
  nositelinkssearchbox?: boolean
  unavailable_after?: string
  'max-video-preview'?: number | string
  'max-image-preview'?: 'none' | 'standard' | 'large'
  'max-snippet'?: number
}
export type Robots = RobotsInfo & {
  // if you want to specify an alternate robots just for google
  googleBot?: string | RobotsInfo
}

export type ResolvedRobots = {
  basic: string | null
  googleBot: string | null
}

export type IconURL = string | URL
export type Icon = IconURL | IconDescriptor
export type IconDescriptor = {
  url: string | URL
  type?: string
  sizes?: string
  color?: string
  /** defaults to rel="icon" unless superseded by Icons map */
  rel?: string
  media?: string
  /**
   * @see https://developer.mozilla.org/docs/Web/API/HTMLImageElement/fetchPriority
   */
  fetchPriority?: 'high' | 'low' | 'auto'
}

export type Icons = {
  /** rel="icon" */
  icon?: Icon | Icon[]
  /** rel="shortcut icon" */
  shortcut?: Icon | Icon[]
  /**
   * @see https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html
   * rel="apple-touch-icon"
   */
  apple?: Icon | Icon[]
  /** rel inferred from descriptor, defaults to "icon" */
  other?: IconDescriptor | IconDescriptor[]
}

export type Verification = {
  google?: null | string | number | (string | number)[]
  yahoo?: null | string | number | (string | number)[]
  yandex?: null | string | number | (string | number)[]
  me?: null | string | number | (string | number)[]
  // if you ad-hoc additional verification
  other?: {
    [name: string]: string | number | (string | number)[]
  }
}

export type ResolvedVerification = {
  google?: null | (string | number)[]
  yahoo?: null | (string | number)[]
  yandex?: null | (string | number)[]
  me?: null | (string | number)[]
  other?: {
    [name: string]: (string | number)[]
  }
}

export type ResolvedIcons = {
  icon: IconDescriptor[]
  apple: IconDescriptor[]
  shortcut?: IconDescriptor[]
  other?: IconDescriptor[]
}

export type ThemeColorDescriptor = {
  color: string
  media?: string
}
