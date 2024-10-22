/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: process.env.__NEXT_EXPERIMENTAL_PPR === 'true',
    dynamicIO: true,
    serverMinification: false,
  },
}

module.exports = nextConfig
