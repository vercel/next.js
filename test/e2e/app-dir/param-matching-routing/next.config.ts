import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: process.env.__NEXT_TEST_AXIS !== 'A',
  experimental: { optimisticRouting: true },
  async rewrites() {
    return [
      {
        source: '/en/closed/alias',
        destination: '/en/closed/known',
      },
      {
        source: '/en/closed/encoded-alias',
        destination: '/en/closed/hello%20world',
      },
      {
        source: '/en/closed/percent-alias',
        destination: '/en/closed/100%25',
      },
      {
        source: '/en/closed/missing-alias',
        destination: '/en/closed/unlisted',
      },
      {
        source: '/fr/catalog/alias/items/:bottom',
        destination: '/en/catalog/novel-top/items/:bottom',
      },
      {
        source: '/en/catalog/blocked-alias/items/:bottom',
        destination: '/fr/catalog/novel-top/items/:bottom',
      },
    ]
  },
}

export default nextConfig
