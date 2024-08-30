/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: true,
    pprFallbacks: true,
    prerenderEarlyExit: false,
  },
}

module.exports = nextConfig
