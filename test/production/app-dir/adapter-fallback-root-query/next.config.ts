import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  adapterPath: require.resolve('./adapter.mjs'),
}

export default nextConfig
