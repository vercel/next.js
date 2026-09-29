import {
  prepareImageConfig,
  type ImageConfigRuntime,
  type PreparedImageConfig,
} from './image-config'

type BrowserImageConfig = Pick<
  ImageConfigRuntime,
  'deviceSizes' | 'imageSizes' | 'qualities'
> &
  Partial<ImageConfigRuntime>

const imageConfig = prepareImageConfig(
  process.env.__NEXT_IMAGE_CONFIG as any as BrowserImageConfig
)

export function getImageConfig(): PreparedImageConfig<BrowserImageConfig> {
  return imageConfig
}
