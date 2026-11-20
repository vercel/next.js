import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  // Exercise the supported polling path in environments without native watch events.
  // Native watcher delivery is covered by turbo-tasks-fs's watcher tests.
  watchOptions: { pollIntervalMs: 50 },
  experimental: {
    goRoutes: true,
    proxyClientMaxBodySize: 64 * 1024,
    turbopackFileSystemCacheForDev: true,
    turbopackFileSystemCacheForBuild: true,
  },
  async rewrites() {
    return [
      { source: '/alias', destination: '/native/123' },
      { source: '/rewritten/:id', destination: '/native/:id' },
      { source: '/native/original', destination: '/native/rewritten' },
      { source: '/catch-alias/:slug*', destination: '/catch/:slug*' },
      {
        source: '/optional-alias/:slug*',
        destination: '/adapter-optional/:slug*',
      },
      { source: '/static-alias', destination: '/adapter-static' },
    ]
  },
}
export default nextConfig
