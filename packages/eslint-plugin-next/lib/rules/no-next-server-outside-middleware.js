const path = require('path')

module.exports = {
  meta: {
    docs: {
      description: 'next/middleware',
      recommended: true,
      url: 'https://nextjs.org/docs/messages/no-script-in-document-page',
    },
  },
  create: function (context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'next/server') {
          return
        }

        const filename = path.basename(
          context.getFilename(),
          path.extname(context.getFilename())
        )

        if (filename === '_middleware') {
          return
        }

        context.report({
          node,
          message: `You're importing from \`next/server\` in files that are not \`_middleware\`. See https://nextjs.org/docs/messages/no-next-server-outside-middleware .`,
        })
      },
    }
  },
}
