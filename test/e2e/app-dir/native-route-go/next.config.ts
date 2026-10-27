import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  // Exercise the supported polling path in environments without native watch events.
  // Native watcher delivery is covered by turbo-tasks-fs's watcher tests.
  watchOptions: { pollIntervalMs: 50 },
  experimental: {
    goRoutes: true,
    turbopackFileSystemCacheForDev: true,
    turbopackFileSystemCacheForBuild: true,
  },
  async rewrites() {
    return [{ source: '/rewritten/:id', destination: '/native/:id' }]
  },
}
export default nextConfig
