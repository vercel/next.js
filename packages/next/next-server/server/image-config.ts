export const VALID_LOADERS = [
  'default',
  'imgix',
  'cloudinary',
  'akamai',
] as const

export type LoaderValue = typeof VALID_LOADERS[number]

export type ImageConfig = {
  deviceSizes: number[]
  imageSizes: number[]
  loader: LoaderValue
  path: string
  domains?: string[]
}

export const imageConfigDefault: ImageConfig = {
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  path: '/_next/image',
  loader: 'default',
  domains: [],
}
