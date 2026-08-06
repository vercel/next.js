/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    dynamicOnHover: true,
    prefetchInlining: false,
  },
}

module.exports = nextConfig
