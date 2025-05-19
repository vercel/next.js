/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'standalone',
  experimental: {
    useCache: true,
  },
}

module.exports = nextConfig
