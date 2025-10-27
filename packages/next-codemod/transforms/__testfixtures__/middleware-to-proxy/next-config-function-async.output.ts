import type { NextConfig } from 'next'

async function nextConfig(): Promise<NextConfig> {
  return {
    experimental: {
      proxyPrefetch: 'flexible',
      proxyClientMaxBodySize: 5 * 1024 * 1024,
      externalProxyRewritesResolve: false,
    },
    skipProxyUrlNormalize: false,
  };
}

export default nextConfig