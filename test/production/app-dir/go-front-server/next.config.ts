import type { NextConfig } from 'next'
const config: NextConfig = {
  experimental: { goServer: true },
  async rewrites() {
    return [
      { source: '/alias', destination: '/js' },
      { source: '/native/:id', destination: '/js' },
    ]
  },
}
export default config
