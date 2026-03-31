import type { NextConfig } from 'next'
import fooWrapper from 'foo-wrapper'
import barWrapper from 'bar-wrapper'
import bazWrapper from 'baz-wrapper'

const nextConfig: NextConfig = {
  experimental: {
    middlewarePrefetch: 'flexible',
    middlewareClientMaxBodySize: '8mb',
    externalMiddlewareRewritesResolve: false,
  },
  skipMiddlewareUrlNormalize: false,
}

export default fooWrapper(barWrapper(bazWrapper(nextConfig)))