/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    authInterrupts: true,
    strictRouteMatching: true,
  },
}

module.exports = nextConfig
