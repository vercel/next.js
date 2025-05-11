/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: process.env.__NEXT_EXPERIMENTAL_PPR === 'true',
    dynamicIO: true,
  },
  serverExternalPackages: ['external-esm-pkg-with-async-import'],
}

module.exports = nextConfig
