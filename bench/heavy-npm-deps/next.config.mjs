/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    turbo: {
      unstablePersistentCaching: process.env.TURBO_CACHE === '1',
    },
  },
}

export default nextConfig
