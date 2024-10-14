/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    dynamicIO: true,
    cacheLife: {
      frequent: {
        stale: 19,
        revalidate: 100,
        expire: 150,
      },
    },
  },
}

module.exports = nextConfig
