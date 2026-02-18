/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheLife: {
    frequent: {
      stale: 19,
      revalidate: 100,
      expire: 300,
    },
  },
}

module.exports = nextConfig
