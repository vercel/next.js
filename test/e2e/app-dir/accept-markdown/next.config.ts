import type { NextConfig } from 'next'
import createMDX from '@next/mdx'

const withMDX = createMDX({})

const nextConfig: NextConfig = {
  pageExtensions: ['ts', 'tsx', 'mdx'],
  experimental: {
    acceptMarkdown: true,
  },
}

export default withMDX(nextConfig)
