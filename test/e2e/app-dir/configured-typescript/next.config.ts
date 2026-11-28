import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.customts': { type: 'typescript' },
    },
  },
}

export default nextConfig
