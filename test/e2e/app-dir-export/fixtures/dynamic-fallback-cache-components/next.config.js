/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  cacheComponents: true,
  experimental: {
    optimisticRouting: true,
  },
}

module.exports = nextConfig
