import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: { turbopackFileSystemCacheForBuild: true },
}

export default nextConfig
