const path = require('path')

const url = 'https://nextjs.org/docs/messages/no-server-import-in-page'
const middlewareRegExp = new RegExp(`^middleware\\.(?:t|j)s$`)

module.exports = {
  meta: {
    docs: {
      description: 'Prevent usage of `next/server` outside of `middleware.js`.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
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
          message: `\`next/server\` should not be used outside of \`middleware.js\`. See: ${url}`,
        })
      },
    }
  },
}
