import type { NextConfig } from 'next'
const config: NextConfig = {
  experimental: {
    goRoutes: true,
    goProxy: { matcher: ['/native-proxy/:path*'] },
  },
}
export default config
