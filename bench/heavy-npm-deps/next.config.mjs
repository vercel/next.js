/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    turbopackPersistentCaching: process.env.TURBO_CACHE === '1',
  },
}

export default nextConfig
