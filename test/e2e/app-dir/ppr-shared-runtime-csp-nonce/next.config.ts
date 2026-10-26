import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    // This is the default, but pin it since the suite is about the inlined
    // Turbopack chunk-group bootstrap that the shared runtime produces.
    turbopackSharedRuntime: true,
  },
}

export default nextConfig
