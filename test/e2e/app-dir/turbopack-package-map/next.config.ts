import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Written by `generate-package-map.mjs` before Next.js starts.
    turbopackPackageMap: './package-map.json',
  },
}

export default nextConfig
