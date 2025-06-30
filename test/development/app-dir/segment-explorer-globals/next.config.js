/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    devtoolSegmentExplorer: true,
    authInterrupts: true,
    globalNotFound: true,
  },
}

module.exports = nextConfig
