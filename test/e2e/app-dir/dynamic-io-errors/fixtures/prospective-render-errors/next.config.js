/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: true,
    dynamicIO: true,
    serverMinification: false,
  },
}

module.exports = nextConfig
