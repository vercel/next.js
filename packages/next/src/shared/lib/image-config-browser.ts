import type { ImageConfigRuntime } from './image-config'

export function getImageConfig(): Partial<ImageConfigRuntime> {
  return process.env.__NEXT_IMAGE_CONFIG as any as Partial<ImageConfigRuntime>
}
