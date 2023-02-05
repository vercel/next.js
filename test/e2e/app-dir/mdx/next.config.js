const withMDX = require('@next/mdx')({
  extension: /\.mdx?$/,
})

console.log({ test: process.env.WITH_MDX_RS === 'true' })
/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'mdx'],
  experimental: {
    appDir: true,
    mdxRs: process.env.WITH_MDX_RS === 'true',
  },
}

module.exports = withMDX(nextConfig)
