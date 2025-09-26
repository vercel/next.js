/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    cacheComponents: true,
    serverMinification: false,
  },
}

module.exports = nextConfig
