import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['test-external-image-config'],
  images: {
    path: '/custom-image',
    deviceSizes: [768, 1440],
    imageSizes: [128, 256],
    qualities: [65, 85],
    formats: ['image/avif'],
    minimumCacheTTL: 123,
    localPatterns: [{ pathname: '/assets/**' }],
  },
}

export default nextConfig
