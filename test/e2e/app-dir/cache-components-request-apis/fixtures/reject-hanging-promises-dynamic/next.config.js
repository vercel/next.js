/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    cacheComponents: true,
    serverMinification: true,
  },
}

module.exports = nextConfig
