/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    swcEnvOptions: {
      mode: 'usage',
      coreJs: '3.38',
    },
  },
}

module.exports = nextConfig
