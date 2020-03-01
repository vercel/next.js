const fs = require('fs')
const blogPostsFolder = './content/blogPosts'

const getPathsForPosts = () =>
  fs.readdirSync(blogPostsFolder).reduce((acc, blogName) => {
    const trimmedName = blogName.substring(0, blogName.length - 3)
    return Object.assign(acc, {
      [`/blog/post/${trimmedName}`]: {
        page: '/blog/post/[slug]',
        query: {
          slug: trimmedName,
        },
      },
    })
  }, {})

module.exports = {
  webpack: configuration => {
    configuration.module.rules.push({
      test: /\.md$/,
      use: 'frontmatter-markdown-loader',
    })
    return configuration
  },
  async exportPathMap(defaultPathMap) {
    return {
      ...defaultPathMap,
      ...getPathsForPosts(),
    }
  },
}
