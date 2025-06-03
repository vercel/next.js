/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    useCache: true,
    prerenderEarlyExit: false,
  },
}

module.exports = nextConfig
