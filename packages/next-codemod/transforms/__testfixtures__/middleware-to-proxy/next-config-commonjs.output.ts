/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    proxyPrefetch: 'flexible',
    proxyClientMaxBodySize: '8mb',
    externalProxyRewritesResolve: false,
  },
  skipProxyUrlNormalize: false,
}

module.exports = nextConfig