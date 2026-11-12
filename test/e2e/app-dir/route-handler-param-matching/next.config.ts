import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  adapterPath: require.resolve('./adapter.mjs'),
  async rewrites() {
    return [
      { source: '/rewritten/:lang/:slug', destination: '/prefix/:lang/:slug' },
    ]
  },
}

export default nextConfig
