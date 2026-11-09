/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  crossOrigin: 'use-credentials',
  experimental: {
    externalBrowserRuntime: true,
  },
}

module.exports = nextConfig
