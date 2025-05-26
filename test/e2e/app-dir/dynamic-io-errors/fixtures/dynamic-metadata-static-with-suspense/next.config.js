/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    dynamicIO: true,
    serverMinification: true,
  },
}

module.exports = nextConfig
