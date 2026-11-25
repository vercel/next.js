import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  distDir: process.env.TEST_DIST_DIR || '.next',
  experimental: { requestInsights: true },
}

export default nextConfig
