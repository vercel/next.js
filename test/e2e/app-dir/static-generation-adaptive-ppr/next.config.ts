import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // This suite specifically exercises the two Cache Components export phases.
  cacheComponents: true,
  cacheHandler: require.resolve('./cache-handler.js'),
  experimental: {
    staticGenerationAdaptive: true,
    cpus: 1,
    staticGenerationChunkSize: 1,
    staticGenerationMaxConcurrency: 1,
  },
}

export default nextConfig
