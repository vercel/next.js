import { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    cacheComponents: true,
    clientSegmentCache: true,
    // This is automatically enabled when running with `__NEXT_EXPERIMENTAL_PPR`,
    // which lets us exercise both modes.
    // clientParamParsing: true,
  },
}

export default nextConfig
