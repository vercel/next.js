import type { ImageConfigRuntime } from './image-config'

let getImageConfigImpl: () => ImageConfigRuntime

if (process.env.NEXT_RUNTIME === 'edge' || process.env.__NEXT_IMAGE_CONFIG) {
  // Bundled server code receives its options from defineEnv. Keep the object
  // stable across reads, as it is also used during module initialization.
  const imageConfig = process.env
    .__NEXT_IMAGE_CONFIG as any as ImageConfigRuntime
  getImageConfigImpl = () => imageConfig
} else {
  // Unbundled external packages share the process-wide registry. Capturing
  // its getter still allows registration after this module is imported.
  getImageConfigImpl = (
    require('./image-config-runtime.external') as typeof import('./image-config-runtime.external')
  ).getImageConfig
}

export function getImageConfig(): ImageConfigRuntime {
  return getImageConfigImpl()
}
