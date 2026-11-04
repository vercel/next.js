import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    turbopackLazyDynamicImports: true,
    turbopackLazyDynamicImportsSSR: true,
  },
}

export default nextConfig
