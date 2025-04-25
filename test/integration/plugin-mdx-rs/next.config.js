const withMDX = require('@next/mdx')()

module.exports = withMDX({
  pageExtensions: ['js', 'jsx', 'mdx'],
  experimental: {
    mdxRs: true,
  },
})
