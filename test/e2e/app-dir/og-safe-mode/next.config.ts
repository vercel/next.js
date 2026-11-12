import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    imgOptSafeMode: { imageResponse: true },
  },
}

export default nextConfig
