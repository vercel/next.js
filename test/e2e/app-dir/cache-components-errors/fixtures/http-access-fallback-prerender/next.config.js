/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    authInterrupts: true,
  },
}

module.exports = nextConfig
