const path = require('path')

module.exports = {
  meta: {
    docs: {
      description: 'Disallow importing next/script inside pages/document.js',
      recommended: true,
    },
  },
  create: function (context) {
    return {
      ImportDeclaration(node) {
        console.log('hello')
        if (node.source.value !== 'next/script') {
          return
        }

        const document = context.getFilename().split('pages')[1]
        if (!document || !path.parse(document).name.startsWith('_document')) {
          return
        }

        context.report({
          node,
          message: `next/script should not be imported in pages/_document.js. See https://nextjs.org/docs/messages/no-document-import-in-page.`,
        })
      },
    }
  },
}
