import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    ppr: true,
    // until the flags are merged, test both `ppr` and `cacheComponents`
    // cacheComponents: true,
  },
}

export default nextConfig
