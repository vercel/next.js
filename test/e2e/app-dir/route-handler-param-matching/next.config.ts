import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  adapterPath:
    process.env.NEXT_ADAPTER_PATH ??
    (process.env.NEXT_ENABLE_ADAPTER !== '0'
      ? require.resolve('./adapter.mjs')
      : undefined),
  async rewrites() {
    return [
      { source: '/rewritten/:lang/:slug', destination: '/prefix/:lang/:slug' },
    ]
  },
}

export default nextConfig
