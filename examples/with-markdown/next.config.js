const images = require('remark-images')
const emoji = require('remark-emoji')

const withMDX = require('@zeit/next-mdx')({
  options: {
    mdPlugins: [images, emoji],
  },
})

module.exports = withMDX({
  pageExtensions: ['js', 'jsx', 'mdx'],
})
