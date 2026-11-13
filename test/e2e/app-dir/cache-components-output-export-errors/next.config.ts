import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',
  cacheComponents: true,
  partialPrefetching: process.env.__NEXT_TEST_AXIS !== 'A',
}

export default nextConfig
