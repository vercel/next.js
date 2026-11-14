import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  adapterPath: require.resolve('./my-adapter.mjs'),
}

export default nextConfig
