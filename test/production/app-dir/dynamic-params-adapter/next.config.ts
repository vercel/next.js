import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: false,
  adapterPath: require.resolve('./adapter.mjs'),
}

export default nextConfig
