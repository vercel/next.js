import type { NextConfig } from 'next'

// The behavior suite starts a WebSocket server and passes its port in at build
// time. The other suite never requests this path.
const externalPort = process.env.FRONT_SERVER_TEST_EXTERNAL_PORT || '1'

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/external/:path*',
        destination: `http://localhost:${externalPort}/:path*`,
      },
    ]
  },
}

export default nextConfig
