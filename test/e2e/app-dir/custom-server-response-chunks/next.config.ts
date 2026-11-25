import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // With compression on, the custom server would only see gzip's output.
  compress: false,
}

export default nextConfig
