import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,

  cacheLife: {
    reproduction: {
      stale: 30,
      revalidate: 5,
      expire: 600,
    },
  },
}

export default nextConfig
