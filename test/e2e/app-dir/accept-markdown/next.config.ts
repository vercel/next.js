import type { NextConfig } from 'next'
import createMDX from '@next/mdx'

const withMDX = createMDX({})

const nextConfig: NextConfig = {
  pageExtensions: ['ts', 'tsx', 'mdx'],
  experimental: {
    acceptMarkdown: true,
  },
  async rewrites() {
    return {
      // User rules come before the generated Markdown rewrites.
      beforeFiles: [{ source: '/overridden', destination: '/static' }],
    }
  },
}

export default withMDX(nextConfig)
