const withMDX = require('@next/mdx')({
  extension: /\.mdx?$/,
})

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'mdx'],
  experimental: {
    mdxRs: process.env.WITH_MDX_RS === 'true',
  },
}

module.exports = withMDX(nextConfig)
