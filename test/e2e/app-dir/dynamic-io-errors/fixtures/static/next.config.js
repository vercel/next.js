/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: true,
    dynamicIO: true,
    serverMinification: true,
  },
}

module.exports = nextConfig
