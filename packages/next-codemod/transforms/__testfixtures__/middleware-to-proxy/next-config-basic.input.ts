import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    middlewarePrefetch: 'strict',
    middlewareClientMaxBodySize: '10mb',
    externalMiddlewareRewritesResolve: true,
  },
  skipMiddlewareUrlNormalize: true,
}

export default nextConfig