import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    cpus: 3,
    staticGenerationAdaptive: true,
    staticGenerationMinPagesPerWorker: 10,
    staticGenerationMaxConcurrency: 2,
    staticGenerationChunkSize: 2,
  },
}

export default nextConfig
