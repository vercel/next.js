import type { NextConfig } from 'next'

async function nextConfig(): Promise<NextConfig> {
  return {
    experimental: {
      middlewarePrefetch: 'flexible',
      middlewareClientMaxBodySize: 5 * 1024 * 1024,
      externalMiddlewareRewritesResolve: false,
    },
    skipMiddlewareUrlNormalize: false,
  }
}

export default nextConfig