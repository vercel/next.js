export const VALID_LOADERS = [
  'default',
  'imgix',
  'cloudinary',
  'akamai',
  'custom',
] as const

export type LoaderValue = (typeof VALID_LOADERS)[number]

export type ImageLoaderProps = {
  src: string
  width: number
  quality?: number
}

export type ImageLoaderPropsWithConfig = ImageLoaderProps & {
  config: Readonly<ImageConfig>
}

export type LocalPattern = {
  /**
   * Can be literal or wildcard.
   * Single `*` matches a single path segment.
   * Double `**` matches any number of path segments.
   */
  pathname?: string

  /**
   * Can be literal query string such as `?v=1` or
   * empty string meaning no query string.
   */
  search?: string
}

export type RemotePattern = {
  /**
   * Must be `http` or `https`.
   */
  protocol?: 'http' | 'https'

  /**
   * Can be literal or wildcard.
   * Single `*` matches a single subdomain.
   * Double `**` matches any number of subdomains.
   */
  hostname: string

  /**
   * Can be literal port such as `8080` or empty string
   * meaning no port.
   */
  port?: string

  /**
   * Can be literal or wildcard.
   * Single `*` matches a single path segment.
   * Double `**` matches any number of path segments.
   */
  pathname?: string

  /**
   * Can be literal query string such as `?v=1` or
   * empty string meaning no query string.
   */
  search?: string
}

type ImageFormat = 'image/avif' | 'image/webp'

/**
 * Image configurations
 *
 * @see [Image configuration options](https://nextjs.org/docs/api-reference/next/image#configuration-options)
 */
export type ImageConfigComplete = {
  /** @see [Device sizes documentation](https://nextjs.org/docs/api-reference/next/image#device-sizes) */
  deviceSizes: number[]

  /** @see [Image sizing documentation](https://nextjs.org/docs/app/building-your-application/optimizing/images#image-sizing) */
  imageSizes: number[]

  /** @see [Image loaders configuration](https://nextjs.org/docs/api-reference/next/legacy/image#loader) */
  loader: LoaderValue

  /** @see [Image loader configuration](https://nextjs.org/docs/api-reference/next/legacy/image#loader-configuration) */
  path: string

  /** @see [Image loader configuration](https://nextjs.org/docs/api-reference/next/image#loader-configuration) */
  loaderFile: string

  /**
   * @deprecated Use `remotePatterns` instead.
   */
  domains: string[]

  /** @see [Disable static image import configuration](https://nextjs.org/docs/api-reference/next/image#disable-static-imports) */
  disableStaticImages: boolean

  /** @see [Cache behavior](https://nextjs.org/docs/api-reference/next/image#caching-behavior) */
  minimumCacheTTL: number

  /** @see [Acceptable formats](https://nextjs.org/docs/api-reference/next/image#acceptable-formats) */
  formats: ImageFormat[]

  /** @see [Dangerously Allow SVG](https://nextjs.org/docs/api-reference/next/image#dangerously-allow-svg) */
  dangerouslyAllowSVG: boolean

  /** @see [Dangerously Allow SVG](https://nextjs.org/docs/api-reference/next/image#dangerously-allow-svg) */
  contentSecurityPolicy: string

  /** @see [Dangerously Allow SVG](https://nextjs.org/docs/api-reference/next/image#dangerously-allow-svg) */
  contentDispositionType: 'inline' | 'attachment'

  /** @see [Remote Patterns](https://nextjs.org/docs/api-reference/next/image#remotepatterns) */
  remotePatterns: RemotePattern[]

  /** @see [Remote Patterns](https://nextjs.org/docs/api-reference/next/image#localPatterns) */
  localPatterns: LocalPattern[] | undefined

  /** @see [Qualities](https://nextjs.org/docs/api-reference/next/image#qualities) */
  qualities: number[] | undefined

  /** @see [Unoptimized](https://nextjs.org/docs/api-reference/next/image#unoptimized) */
  unoptimized: boolean
}

export type ImageConfig = Partial<ImageConfigComplete>

export const imageConfigDefault: ImageConfigComplete = {
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  path: '/_next/image',
  loader: 'default',
  loaderFile: '',
  domains: [],
  disableStaticImages: false,
  minimumCacheTTL: 60,
  formats: ['image/webp'],
  dangerouslyAllowSVG: false,
  contentSecurityPolicy: `script-src 'none'; frame-src 'none'; sandbox;`,
  contentDispositionType: 'attachment',
  localPatterns: undefined, // default: allow all local images
  remotePatterns: [], // default: allow no remote images
  qualities: undefined, // default: allow all qualities
  unoptimized: false,
}
