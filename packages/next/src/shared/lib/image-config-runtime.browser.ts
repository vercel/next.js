import type { ImageConfigRuntime } from './image-config'

const imageConfig = process.env
  .__NEXT_IMAGE_CONFIG as any as Partial<ImageConfigRuntime>

export function getImageConfig(): Partial<ImageConfigRuntime> {
  return imageConfig
}
