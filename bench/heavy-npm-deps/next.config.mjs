/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    turbopackPersistentCachingForDev: process.env.TURBO_CACHE === '1',
    turbopackPersistentCachingForBuild: process.env.TURBO_CACHE === '1',
  },
}

export default nextConfig
