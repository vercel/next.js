import type { ImageConfigRuntime } from './image-config'

export function getImageConfig(): ImageConfigRuntime {
  return process.env.__NEXT_IMAGE_CONFIG as any as ImageConfigRuntime
}
