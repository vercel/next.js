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
    ppr: true,
  },
  redirects() {
    return [
      { source: '/', destination: '/vercel/vercel-site', permanent: false },
    ]
  },
}

module.exports = nextConfig
