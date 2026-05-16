import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [new URL('https://image-optimization-test.vercel.app/**')],
    qualities: [50, 55, 60, 65, 70, 75, 80, 85, 90],
  },
}

export default nextConfig
