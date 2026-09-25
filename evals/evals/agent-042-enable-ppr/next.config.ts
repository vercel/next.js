import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // @ts-expect-error -- legacy config retained for the migration exercise
    dynamicIO: true,
  },
}

export default nextConfig
