import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    turbopackLazyDynamicImports: true,
  },
}

export default nextConfig
