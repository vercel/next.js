import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    turbopackLazyDynamicImports: true,
    turbopackFileSystemCacheForDev: false,
  },
}

export default nextConfig
