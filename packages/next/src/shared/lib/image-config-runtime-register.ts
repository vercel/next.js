import type { ImageConfigRuntime } from './image-config'

// Server entry templates import this before userland. This bundled shim reads
// the options inlined by defineEnv and registers them with the external store
// for direct handlers and workers that have not loaded the app config yet.
if (process.env.NEXT_RUNTIME === 'edge') {
  // Edge bundles use their inlined image configuration directly.
} else {
  const { registerImageConfig } =
    require('./image-config-runtime.external') as typeof import('./image-config-runtime.external')
  registerImageConfig(
    process.env.__NEXT_IMAGE_CONFIG as any as ImageConfigRuntime
  )
}
