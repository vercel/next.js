import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    // Without a predicted route, the client only starts to render a route it
    // hasn't prefetched once it has received the response. It also doesn't
    // substitute an empty head for a prefetched one that is partial.
    optimisticRouting: process.env.__NEXT_TEST_AXIS !== 'A',
  },
}

export default nextConfig
