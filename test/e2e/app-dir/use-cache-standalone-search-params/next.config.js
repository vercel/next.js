/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    useCache: true,
    prerenderEarlyExit: false,
    ppr: process.env.__NEXT_EXPERIMENTAL_PPR === 'true',
  },
}

module.exports = nextConfig
