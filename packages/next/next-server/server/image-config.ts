export const VALID_LOADERS = [
  'default',
  'imgix',
  'cloudinary',
  'akamai',
  'custom',
] as const

export type LoaderValue = typeof VALID_LOADERS[number]

interface BaseImageConfig {
  deviceSizes: number[]
  imageSizes: number[]
  path: string
  domains?: string[]
}

interface ImageConfigWithLoader {
  loader: LoaderValue
  resolver?: undefined
}

interface ImageConfigWithResolver {
  resolver: LoaderValue
  loader?: undefined
}

export type ImageConfig = BaseImageConfig &
  (ImageConfigWithLoader | ImageConfigWithResolver)

export const imageConfigDefault: ImageConfig = {
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  path: '/_next/image',
  loader: 'default',
  domains: [],
}
