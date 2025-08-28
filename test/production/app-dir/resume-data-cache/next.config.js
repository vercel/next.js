/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    cacheComponents: true,
    clientSegmentCache: true,
    clientParamParsing: true,
  },
}

module.exports = nextConfig
