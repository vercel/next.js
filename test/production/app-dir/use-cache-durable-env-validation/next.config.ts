import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    durableUseCacheEntries:
      process.env.TEST_DURABLE_USE_CACHE_ENTRIES !== 'false',
    durableUseCacheEntriesConfig: {
      unstableEnvVars: [
        'UNSTABLE_DURABLE_TEST',
        'UNSTABLE_DURABLE_TEST_EXISTENCE',
      ],
    },
  },
}

export default nextConfig
