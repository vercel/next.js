/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    turbopackLazyDynamicImports: true,
    turbopackLazyDynamicImportsSSR: true,
  },
}

module.exports = nextConfig
