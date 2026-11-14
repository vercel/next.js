/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  partialPrefetching: false,
  experimental: {
    useCache: true,
  },
  output: 'export',
}

module.exports = nextConfig
