/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: process.env.__NEXT_EXPERIMENTAL_PPR === 'true',
    dynamicIO: true,
    prerenderEarlyExit: false,
  },
}

module.exports = nextConfig
