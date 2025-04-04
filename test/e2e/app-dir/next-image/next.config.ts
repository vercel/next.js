import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [new URL('https://image-optimization-test.vercel.app/**')],
  },
}

export default nextConfig
