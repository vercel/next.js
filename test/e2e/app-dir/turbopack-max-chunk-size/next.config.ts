import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    turbopackMinifyBeforeChunking:
      process.env.TEST_MINIFY_BEFORE_CHUNKING === 'true',
    turbopackChunking: {
      minChunkSize: 5_000,
      maxMergeChunkSize: 20_000,
      maxChunkSize: 20_000,
      minServerChunkSize: 4_000,
      maxMergeServerChunkSize: 20_000,
      maxServerChunkSize: 20_000,
    },
  },
}

export default nextConfig
