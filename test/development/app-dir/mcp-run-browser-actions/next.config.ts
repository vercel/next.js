import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    mcpBrowserActions: true,
  },
  async redirects() {
    return [
      {
        source: '/leave',
        destination: 'http://127.0.0.1:59999/outside',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
