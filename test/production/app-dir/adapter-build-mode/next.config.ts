import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  adapterPath: require.resolve('./adapter.mjs'),
}

export default nextConfig
