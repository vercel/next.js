const path = require('path')

module.exports = {
  meta: {
    docs: {
      description:
        'Disallow importing next/server outside of pages/_middleware.js',
      recommended: true,
      url: 'https://nextjs.org/docs/messages/no-server-import-in-page',
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
          page.startsWith(`${path.sep}_middleware`) ||
          page.startsWith(`${path.posix.sep}_middleware`)
        ) {
          return
        }

        context.report({
          node,
          message: `next/server should not be imported outside of pages/_middleware.js. See https://nextjs.org/docs/messages/no-server-import-in-page.`,
        })
      },
    }
  },
}
