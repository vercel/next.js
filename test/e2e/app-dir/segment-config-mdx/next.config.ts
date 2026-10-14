import type { NextConfig } from 'next'
import nextMDX from '@next/mdx'

const withMDX = nextMDX({ extension: /\.mdx?$/ })

const nextConfig: NextConfig = {
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'mdx'],
  experimental: {
    mdxRs: process.env.WITH_MDX_RS === 'true',
  },
}

export default withMDX(nextConfig)
