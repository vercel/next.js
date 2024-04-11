/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
    clientTraceMetadata: true,
  },
}

module.exports = nextConfig
