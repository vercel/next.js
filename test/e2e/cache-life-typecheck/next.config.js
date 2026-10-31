/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheLife: {
    blog: {
      stale: 300,
      revalidate: 900,
      expire: 3600,
    },
  },
}

module.exports = nextConfig
