/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    dynamicIO: true,
    clientSegmentCache: true,
    dynamicOnHover: true,
  },
}

module.exports = nextConfig
