const mdx = require('@next/mdx')

const withMDX = mdx()

const nextConfig = {
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
  experimental: {
    appDir: true,
    mdxRs: true,
  },
}

module.exports = withMDX(nextConfig)
