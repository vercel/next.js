const withMDX = require('@next/mdx')()

module.exports = withMDX({
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
  experimental: {
    mdxRs: true,
  },
  images: {
    domains: [
      'pbs.twimg.com',
      'abs.twimg.com',
      'm.media-amazon.com',
      'images-na.ssl-images-amazon.com',
    ],
  },
})
