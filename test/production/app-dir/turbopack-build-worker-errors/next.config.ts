import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.crash': {
        loaders: ['./crash-loader.js'],
        as: '*.js',
      },
    },
  },
  experimental: {
    turbopackBuildWorker: true,
    // The loader runs in a Node.js process started by Turbopack, i.e. by the
    // build worker, which is the process it kills (see `crash-loader.js`).
    turbopackPluginRuntimeStrategy: 'childProcesses',
  },
}

export default nextConfig
