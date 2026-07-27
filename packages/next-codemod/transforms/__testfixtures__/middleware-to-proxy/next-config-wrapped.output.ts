import type { NextConfig } from 'next'
import fooWrapper from 'foo-wrapper'
import barWrapper from 'bar-wrapper'
import bazWrapper from 'baz-wrapper'

const nextConfig: NextConfig = {
  experimental: {
    proxyPrefetch: 'flexible',
    proxyClientMaxBodySize: '8mb',
    externalProxyRewritesResolve: false,
  },
  skipProxyUrlNormalize: false,
}

export default fooWrapper(barWrapper(bazWrapper(nextConfig)))