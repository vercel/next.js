/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    turbopackFileSystemCacheForDev: process.env.TURBO_CACHE === '1',
    turbopackFileSystemCacheForBuild: process.env.TURBO_CACHE === '1',
  },
}

export default nextConfig
