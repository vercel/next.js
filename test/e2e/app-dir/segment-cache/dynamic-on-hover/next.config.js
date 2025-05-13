/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: true,
    dynamicIO: true,
    clientSegmentCache: true,
    dynamicOnHover: true,
  },
}

module.exports = nextConfig
