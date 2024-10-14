/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    dynamicIO: true,
    cacheLife: {
      frequent: {
        revalidate: 100,
      },
    },
  },
}

module.exports = nextConfig
