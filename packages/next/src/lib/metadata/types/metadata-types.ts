/**
 *
 * Metadata types
 *
 */
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

export type Robots = {
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

  // if you want to specify an alternate robots just for google
  googleBot?: string | Robots
}

export type Icon = string | IconDescriptor | URL
export type IconDescriptor = {
  url: string | URL
  type?: string
  sizes?: string
  // defaults to rel="icon" unless superceded by Icons map
  rel?: string
}
export type Icons = {
  // rel="icon"
  icon?: Icon | Array<Icon>
  // rel="shortcut icon"
  shortcut?: Icon | Array<Icon>
  // rel="apple-touch-icon"
  apple?: Icon | Array<Icon>
  // rel inferred from descriptor, defaults to "icon"
  other?: IconDescriptor | Array<IconDescriptor>
}

export type Verification = {
  google?: null | string | number | Array<string | number>
  yahoo?: null | string | number | Array<string | number>
  // if you ad-hoc additional verification
  other?: {
    [name: string]: string | number | Array<string | number>
  }
}
