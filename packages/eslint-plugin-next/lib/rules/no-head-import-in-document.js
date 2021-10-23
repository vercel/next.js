const path = require('path')

module.exports = {
  meta: {
    docs: {
      description: 'Disallow importing next/head in pages/document.js',
      recommended: true,
      url: 'https://nextjs.org/docs/messages/no-head-import-in-document',
    },
  },
  create: function (context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'next/head') {
          return
        }

        const document = context.getFilename().split('pages')[1]
        if (!document) {
          return
        }

        const { name, dir } = path.parse(document)

        if (
          name.startsWith('_document') ||
          (dir === '/_document' && name === 'index')
        ) {
          context.report({
            node,
            message: `next/head should not be imported in pages${document}. Import Head from next/document instead. See https://nextjs.org/docs/messages/no-head-import-in-document.`,
          })
        }
      },
    }
  },
}
