import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Exercise runtime validation independently of the generated type checks.
  typescript: { ignoreBuildErrors: true },
}

export default nextConfig
