/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    reportSystemEnvVarInlining: 'error',
  },
}

module.exports = nextConfig
