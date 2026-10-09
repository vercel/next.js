/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    disableOptimizedLoading: true,
    turbopackLazyDynamicImports: true,
    turbopackLazyDynamicImportsSSR: true,
  },
}

module.exports = nextConfig
