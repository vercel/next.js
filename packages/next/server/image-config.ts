export const VALID_LOADERS = [
  'default',
  'imgix',
  'cloudinary',
  'akamai',
  'custom',
] as const

export type LoaderValue = typeof VALID_LOADERS[number]

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

  /** @see [Image domains configuration](https://nextjs.org/docs/basic-features/image-optimization#domains) */
  domains?: string[]

  /** @see [Cache behavior](https://nextjs.org/docs/api-reference/next/image#caching-behavior) */
  disableStaticImages?: boolean

  /** @see [Cache behavior](https://nextjs.org/docs/api-reference/next/image#caching-behavior) */
  minimumCacheTTL?: number

  /** @see [Acceptable formats](https://nextjs.org/docs/api-reference/next/image#acceptable-formats) */
  formats?: ImageFormat[]
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
}

export let imageConfigRuntime: Partial<ImageConfigComplete> = imageConfigDefault

export function setImageConfigRuntime(
  imageConfig: Partial<ImageConfigComplete>
) {
  if (imageConfig) {
    imageConfigRuntime = imageConfig
  }
}
