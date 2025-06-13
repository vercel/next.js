/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    dynamicIO: true,
  },
  redirects() {
    return [{ source: '/', destination: '/foo', permanent: false }]
  },
}

module.exports = nextConfig
