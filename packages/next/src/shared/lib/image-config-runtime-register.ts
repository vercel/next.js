import type { ImageConfigRuntime } from './image-config'

// Server entry templates import this before userland. The bundled image
// options are available before a direct handler can load its manifest.
if (process.env.NEXT_RUNTIME === 'edge') {
  // Edge bundles use their inlined image configuration directly.
} else {
  const { registerImageConfig } =
    require('./image-config-runtime.external') as typeof import('./image-config-runtime.external')
  registerImageConfig(
    process.env.__NEXT_IMAGE_CONFIG as any as ImageConfigRuntime
  )
}
