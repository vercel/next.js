import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    turbopackModuleFederation: {
      implementation: process.env.MF_RUNTIME_OVERRIDE || undefined,
      shareStrategy: process.env.MF_RUNTIME_OVERRIDE
        ? 'loaded-first'
        : 'version-first',
      shared: process.env.MF_RUNTIME_OVERRIDE
        ? {
            'local-value': {
              import: './app/local-value.js',
              version: '1.0.0',
              requiredVersion: false,
              singleton: true,
            },
          }
        : undefined,
      remotes: {
        catalog: 'catalog@https://example.invalid/remoteEntry.js',
      },
    },
  },
}

export default nextConfig
