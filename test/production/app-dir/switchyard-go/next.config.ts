import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: { goRoutes: true },
  // Until Switchyard compresses responses as Node does, an app with compress
  // on gets no direct routes.
  compress: false,
}

export default nextConfig
