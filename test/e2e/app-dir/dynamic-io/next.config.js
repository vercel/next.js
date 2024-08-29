/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: !!process.env.__NEXT_EXPERIMENTAL_PPR,
    dynamicIO: true,
  },
}

module.exports = nextConfig
