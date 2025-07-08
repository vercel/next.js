/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: true,
    useCache: true,
    turbopackMinify: false,
  },
}

module.exports = nextConfig
