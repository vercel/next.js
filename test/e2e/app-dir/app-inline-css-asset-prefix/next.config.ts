import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The assetPrefix does not need to be reachable. The test only checks the
  // URLs in the rendered HTML.
  assetPrefix: 'https://example.vercel.sh',
  experimental: {
    inlineCss: true,
  },
}

export default nextConfig
