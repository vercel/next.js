import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: false,
  experimental: {
    serverActions: {
      allowedOrigins: [
        'exact.example.test',
        'port.example.test:8443',
        '*.single.example.test',
        '**.multi.example.test',
        '*.port-wildcard.example.test:8443',
      ],
    },
  },
}
export default nextConfig
