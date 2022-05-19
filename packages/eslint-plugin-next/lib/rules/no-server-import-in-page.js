const path = require('path')

const url = 'https://nextjs.org/docs/messages/no-server-import-in-page'

module.exports = {
  meta: {
    docs: {
      description: 'Prevent usage of `next/server` outside of `middleware.js`.',
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
          message: `\`next/server\` should not be used outside of \`middleware.js\`. See: ${url}`,
        })
      },
    }
  },
}
