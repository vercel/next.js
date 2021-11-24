export const VALID_LOADERS = [
  'default',
  'imgix',
  'cloudinary',
  'akamai',
  'custom',
] as const

export type LoaderValue = typeof VALID_LOADERS[number]

type ImageFormat = 'image/avif' | 'image/webp'

export type ImageConfigComplete = {
  deviceSizes: number[]
  imageSizes: number[]
  loader: LoaderValue
  path: string
  domains?: string[]
  disableStaticImages?: boolean
  minimumCacheTTL?: number
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
