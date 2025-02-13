/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    dynamicIO: true,
    disableBackgroundRevalidation: true,
  },
}

module.exports = nextConfig
