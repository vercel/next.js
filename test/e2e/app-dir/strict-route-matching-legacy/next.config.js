/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    // This is a temporary escape hatch for applications that need the old
    // behavior while strict route matching rolls out by default.
    strictRouteMatching: false,
  },
}

module.exports = nextConfig
