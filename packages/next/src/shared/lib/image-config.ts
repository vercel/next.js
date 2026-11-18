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

  /** @see [Image loader configuration](https://nextjs.org/docs/app/api-reference/components/image#path) */
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

  /** @see [Maximum Disk Cache Size (in bytes)](https://nextjs.org/docs/api-reference/next/image#maximumdiskcachesize) */
  maximumDiskCacheSize: number | undefined

  /** @see [Maximum Redirects](https://nextjs.org/docs/api-reference/next/image#maximumredirects) */
  maximumRedirects: number

  /** @see [Maximum Response Body](https://nextjs.org/docs/api-reference/next/image#maximumresponsebody) */
  maximumResponseBody: number

  /** @see [Dangerously Allow Local IP](https://nextjs.org/docs/api-reference/next/image#dangerously-allow-local-ip) */
  dangerouslyAllowLocalIP: boolean

  /** @see [Dangerously Allow SVG](https://nextjs.org/docs/api-reference/next/image#dangerously-allow-svg) */
  dangerouslyAllowSVG: boolean

  /** @see [Content Security Policy](https://nextjs.org/docs/api-reference/next/image#contentsecuritypolicy) */
  contentSecurityPolicy: string

  /** @see [Content Disposition Type](https://nextjs.org/docs/api-reference/next/image#contentdispositiontype) */
  contentDispositionType: 'inline' | 'attachment'

  /** @see [Remote Patterns](https://nextjs.org/docs/api-reference/next/image#remotepatterns) */
  remotePatterns: Array<URL | RemotePattern>

  /** @see [Local Patterns](https://nextjs.org/docs/api-reference/next/image#localPatterns) */
  localPatterns: LocalPattern[] | undefined

  /** @see [Qualities](https://nextjs.org/docs/api-reference/next/image#qualities) */
  qualities: number[] | undefined

  /** @see [Unoptimized](https://nextjs.org/docs/api-reference/next/image#unoptimized) */
  unoptimized: boolean

  /**
   * When true, the `cacheHandler` configured in next.config.js will also be used
   * for caching optimized images. When false, images use the default filesystem cache.
   * @see [Image Optimization Caching](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandler#image-optimization-caching)
   */
  customCacheHandler: boolean
}

export type ImageConfig = Partial<ImageConfigComplete>

type RequiredImageConfigForRendering = Pick<
  ImageConfigComplete,
  | 'deviceSizes'
  | 'imageSizes'
  | 'loader'
  | 'path'
  | 'dangerouslyAllowSVG'
  | 'unoptimized'
>

export type ImageConfigForRendering = RequiredImageConfigForRendering &
  Partial<
    Pick<
      ImageConfigComplete,
      'qualities' | 'domains' | 'remotePatterns' | 'localPatterns'
    >
  > & {
    output?: 'standalone' | 'export'
  }

export type PreparedImageConfig = RequiredImageConfigForRendering & {
  allSizes: number[]
  qualities: ImageConfigComplete['qualities']
  domains: ImageConfigComplete['domains'] | undefined
  remotePatterns: ImageConfigComplete['remotePatterns'] | undefined
  localPatterns: ImageConfigComplete['localPatterns']
  output: 'standalone' | 'export' | undefined
}

const missingImageConfig = {}
const preparedImageConfigs = new WeakMap<
  object,
  WeakMap<object, PreparedImageConfig>
>()

/**
 * Prepare owned, sorted image options once for each env/context pair.
 * Changed options require new objects because results are cached by identity.
 */
export function prepareImageConfig(
  envConfig?: ImageConfigForRendering,
  contextConfig?: ImageConfigComplete
): PreparedImageConfig {
  const envKey = envConfig ?? missingImageConfig
  const contextKey = contextConfig ?? missingImageConfig
  let preparedByContext = preparedImageConfigs.get(envKey)
  if (preparedByContext) {
    const cached = preparedByContext.get(contextKey)
    if (cached) {
      return cached
    }
  }

  const source: ImageConfigForRendering =
    envConfig || contextConfig || imageConfigDefault
  const deviceSizes = [...source.deviceSizes].sort((a, b) => a - b)
  const imageSizes = [...source.imageSizes]
  const prepared: PreparedImageConfig = {
    deviceSizes,
    imageSizes,
    allSizes: [...deviceSizes, ...imageSizes].sort((a, b) => a - b),
    qualities:
      source.qualities === undefined
        ? undefined
        : [...source.qualities].sort((a, b) => a - b),
    path: source.path,
    loader: source.loader,
    dangerouslyAllowSVG: source.dangerouslyAllowSVG,
    unoptimized: source.unoptimized,
    domains: source.domains,
    remotePatterns: source.remotePatterns,
    // The inlined browser options supply their own patterns. During SSR the
    // context supplies security-sensitive patterns omitted from the inline data.
    localPatterns:
      typeof window === 'undefined' && contextConfig !== undefined
        ? contextConfig.localPatterns
        : source.localPatterns,
    output: source.output,
  }

  if (!preparedByContext) {
    preparedByContext = new WeakMap()
    preparedImageConfigs.set(envKey, preparedByContext)
  }
  preparedByContext.set(contextKey, prepared)
  return prepared
}

export const imageConfigDefault: ImageConfigComplete = {
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [32, 48, 64, 96, 128, 256, 384],
  path: '/_next/image',
  loader: 'default',
  loaderFile: '',
  /**
   * @deprecated Use `remotePatterns` instead to protect your application from malicious users.
   */
  domains: [],
  disableStaticImages: false,
  minimumCacheTTL: 14400, // 4 hours
  formats: ['image/webp'],
  maximumDiskCacheSize: undefined, // auto-detect by default
  maximumRedirects: 3,
  maximumResponseBody: 50_000_000, // 50 MB
  dangerouslyAllowLocalIP: false,
  dangerouslyAllowSVG: false,
  contentSecurityPolicy: `script-src 'none'; frame-src 'none'; sandbox;`,
  contentDispositionType: 'attachment',
  localPatterns: undefined, // default: allow all local images
  remotePatterns: [], // default: allow no remote images
  qualities: [75],
  unoptimized: false,
  customCacheHandler: false,
}
