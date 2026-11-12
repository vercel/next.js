import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: process.env.__NEXT_PARTIAL_PREFETCHING !== 'false',
}
export default nextConfig
