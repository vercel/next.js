import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  headers() {
    return [
      {
        source: '/preloads',
        headers: [
          { key: 'Link', value: '<https://example.com>; rel="preconnect"' },
        ],
      },
    ]
  },
}

export default nextConfig
