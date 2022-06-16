export const VALID_LOADERS = [
  'default',
  'imgix',
  'cloudinary',
  'akamai',
  'custom',
] as const

export type LoaderValue = typeof VALID_LOADERS[number]

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

  /** @see [Image sizing documentation](https://nextjs.org/docs/basic-features/image-optimization#image-sizing) */
  imageSizes: number[]

  /** @see [Image loaders configuration](https://nextjs.org/docs/basic-features/image-optimization#loaders) */
  loader: LoaderValue

  /** @see [Image loader configuration](https://nextjs.org/docs/api-reference/next/image#loader-configuration) */
  path: string

  /**
   * @see [Image domains configuration](https://nextjs.org/docs/api-reference/next/image#domains)
   */
  domains: string[]

  /** @see [Cache behavior](https://nextjs.org/docs/api-reference/next/image#caching-behavior) */
  disableStaticImages: boolean

  /** @see [Cache behavior](https://nextjs.org/docs/api-reference/next/image#caching-behavior) */
  minimumCacheTTL: number

  /** @see [Acceptable formats](https://nextjs.org/docs/api-reference/next/image#acceptable-formats) */
  formats: ImageFormat[]

  /** @see [Dangerously Allow SVG](https://nextjs.org/docs/api-reference/next/image#dangerously-allow-svg) */
  dangerouslyAllowSVG: boolean

  /** @see [Dangerously Allow SVG](https://nextjs.org/docs/api-reference/next/image#dangerously-allow-svg) */
  contentSecurityPolicy: string
}

export type ImageConfig = Partial<ImageConfigComplete>

export const imageConfigDefault: ImageConfigComplete = {
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  path: '/_next/image',
  loader: 'default',
  domains: [],
  disableStaticImages: false,
  minimumCacheTTL: 60,
  formats: ['image/webp'],
  dangerouslyAllowSVG: false,
  contentSecurityPolicy: `script-src 'none'; frame-src 'none'; sandbox;`,
}
