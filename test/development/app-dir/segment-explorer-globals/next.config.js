/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    authInterrupts: true,
    globalNotFound: true,
  },
}

module.exports = nextConfig
