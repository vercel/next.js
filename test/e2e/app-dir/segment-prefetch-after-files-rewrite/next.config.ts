import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  basePath: '/base',
  async rewrites() {
    return {
      beforeFiles: [],
      // A catch-all user rewrite. It must not break the router's segment
      // prefetches for pages that exist, or for paths it serves.
      afterFiles: [{ source: '/:slug', destination: '/rewritten/:slug' }],
      fallback: [],
    }
  },
}

export default nextConfig
