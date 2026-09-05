/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    turbopackLazyDynamicImports: true,
  },
}

module.exports = nextConfig
