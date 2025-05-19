/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    dynamicIO: true,
    serverMinification: false,
  },
}

module.exports = nextConfig
