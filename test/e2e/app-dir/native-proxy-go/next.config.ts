import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    goRoutes: true,
    // @ts-expect-error -- Internal option used to exercise host-aware proxies.
    trustHostHeader: true,
  },
}

export default nextConfig
