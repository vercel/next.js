import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    nativeRscRuntime: true,
  },
  async headers() {
    return [
      {
        // The page's own headers replace ones the config sets.
        source: '/',
        has: [{ type: 'query', key: 'config-header' }],
        headers: [{ key: 'content-type', value: 'text/plain' }],
      },
    ]
  },
}

export default nextConfig
