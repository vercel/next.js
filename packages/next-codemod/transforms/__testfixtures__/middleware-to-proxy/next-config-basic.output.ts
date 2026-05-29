import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    proxyPrefetch: 'strict',
    proxyClientMaxBodySize: '10mb',
    externalProxyRewritesResolve: true,
  },
  skipProxyUrlNormalize: true,
}

export default nextConfig