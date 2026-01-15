/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // NO cacheComponents - export const staleTime doesn't work with cacheComponents
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 30,
    },
  },
}

module.exports = nextConfig
