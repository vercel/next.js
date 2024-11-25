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
      unstablePersistentCaching: process.env.TURBO_CACHE ? true : false,
    },
  },
}

export default nextConfig
