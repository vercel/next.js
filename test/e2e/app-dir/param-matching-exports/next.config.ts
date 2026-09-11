import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: { paramMatching: true },
  // Exercise runtime validation independently of the generated type checks.
  typescript: { ignoreBuildErrors: true },
}

export default nextConfig
