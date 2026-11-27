import fs from 'fs'
import path from 'path'
import type { NextConfig } from 'next'

// Records which process evaluates this config. The Turbopack build worker must
// never load it: it only receives the serialized options from the main process.
fs.appendFileSync(
  path.join(__dirname, '.config-evaluations'),
  `${process.env.NEXT_PRIVATE_TURBOPACK_BUILD_WORKER ? 'build-worker' : 'main'}\n`
)

const nextConfig: NextConfig = {
  // `next build` sets `process.env.NEXT_DEPLOYMENT_ID` from this. The loader
  // below reads it during the compilation, see `env-loader.js`.
  deploymentId: 'turbopack-build-worker',
  turbopack: {
    rules: {
      '*.probe': {
        loaders: ['./env-loader.js'],
        as: '*.js',
      },
    },
  },
  experimental: {
    turbopackBuildWorker: true,
  },
}

export default nextConfig
