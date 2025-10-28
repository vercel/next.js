import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true, // implies `rootParams: true`.
}

export default nextConfig
