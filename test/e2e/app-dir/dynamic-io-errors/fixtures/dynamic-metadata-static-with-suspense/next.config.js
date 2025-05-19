/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: true,
    pprFallbacks: process.env.__NEXT_EXPERIMENTAL_PPR === 'true',
    dynamicIO: true,
    serverMinification: true,
  },
}

module.exports = nextConfig
