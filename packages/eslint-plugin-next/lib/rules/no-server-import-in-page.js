const path = require('path')

module.exports = {
  meta: {
    docs: {
      description: 'Disallow importing next/server outside of middleware.js',
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

        const filename = context.getFilename()
        if (
          filename.startsWith('middleware.') ||
          filename.startsWith(`${path.sep}middleware.`) ||
          filename.startsWith(`${path.posix.sep}middleware.`)
        ) {
          return
        }

        context.report({
          node,
          message: `next/server should not be imported outside of middleware.js. See: https://nextjs.org/docs/messages/no-server-import-in-page`,
        })
      },
    }
  },
}
