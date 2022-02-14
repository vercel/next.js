const path = require('path')

const url = 'https://nextjs.org/docs/messages/no-server-import-in-page'

module.exports = {
  meta: {
    docs: {
      description:
        'Prevent usage of `next/server` outside of `pages/_middleware.js`.',
      recommended: true,
      url,
    },
  },
  create: function (context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'next/server') {
          return
        }

        const paths = context.getFilename().split('pages')
        const page = paths[paths.length - 1]

        if (
          !page ||
          page.includes(`${path.sep}_middleware`) ||
          page.includes(`${path.posix.sep}_middleware`)
        ) {
          return
        }

        context.report({
          node,
          message: `\`next/server\` should not be used outside of \`pages/_middleware.js\`. See: ${url}`,
        })
      },
    }
  },
}
