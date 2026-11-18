import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: process.env.__NEXT_TEST_AXIS !== 'A',
  experimental: {
    cachedNavigations: false,
    exposeTestingApiInProductionBuild: process.env.__NEXT_TEST_AXIS !== 'A',
  },
}

export default nextConfig
