/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    middlewarePrefetch: 'flexible',
    middlewareClientMaxBodySize: '8mb',
    externalMiddlewareRewritesResolve: false,
  },
  skipMiddlewareUrlNormalize: false,
}

module.exports = nextConfig