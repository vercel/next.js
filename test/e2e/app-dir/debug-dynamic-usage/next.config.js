/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    dynamicIO: true,
    ppr: process.env.__NEXT_EXPERIMENTAL_PPR === 'true',
    // serverSourceMaps: true,
    // serverMinification: false,
  },
}

module.exports = nextConfig
