import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Webpack doesn't emit server source maps by default.
    serverSourceMaps: true,
  },
}

export default nextConfig
