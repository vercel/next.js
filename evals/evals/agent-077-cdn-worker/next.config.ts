import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Serve static assets from the CDN in production only; dev stays local.
  assetPrefix:
    process.env.NODE_ENV === 'production'
      ? 'https://cdn.acme-static.example'
      : undefined,
}

export default nextConfig
