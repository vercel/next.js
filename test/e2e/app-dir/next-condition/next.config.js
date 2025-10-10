/**
 * @type {import('next').NextConfig}
 */

const nextConfig = {
  serverExternalPackages: [
    'my-external-esm-package',
    'my-external-cjs-package',
  ],
  experimental: {
    cacheComponents: process.env.__NEXT_EXPERIMENTAL_CACHE_COMPONENTS
      ? true
      : false,
  },
}

module.exports = nextConfig
