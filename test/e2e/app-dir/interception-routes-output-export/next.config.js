/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'export',
  cacheComponents: false,
  partialPrefetching: false,
  experimental: {
    cachedNavigations: false,
  },
}

module.exports = nextConfig
