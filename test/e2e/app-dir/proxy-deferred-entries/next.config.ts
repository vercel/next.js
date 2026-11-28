import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    deferredEntries: ['/deferred'],
  },
}

export default nextConfig
