import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  compress: false,
  cacheMaxMemorySize:
    process.env.TEST_MEMORY_CACHE_OFF === '1' ? 0 : 50 * 1024 * 1024,
  experimental: { preloadEntriesOnStart: false },
  async rewrites() {
    return [{ source: '/alias', destination: '/' }]
  },
  async headers() {
    return [
      {
        source: '/alias',
        headers: [
          { key: 'X-Configured', value: 'kept' },
          { key: 'Cache-Control', value: 'public, max-age=7' },
        ],
      },
    ]
  },
}

export default nextConfig
