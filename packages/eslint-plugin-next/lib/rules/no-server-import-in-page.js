const path = require('path')

const middlewareRegExp = new RegExp(`^middleware\\.(?:t|j)s$`)

module.exports = {
  meta: {
    docs: {
      description: 'Disallow importing next/server outside of middleware',
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
        if (middlewareRegExp.test(path.basename(filename))) {
          return
        }

        context.report({
          node,
          message: `next/server should not be imported outside of Middleware. Read more: https://nextjs.org/docs/messages/no-server-import-in-page`,
        })
      },
    }
  },
}
