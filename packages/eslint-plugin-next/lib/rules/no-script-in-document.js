const path = require('path')

module.exports = {
  meta: {
    docs: {
      description: 'Disallow importing next/script inside pages/_document.js',
      recommended: true,
      url: 'https://nextjs.org/docs/messages/no-script-in-document-page',
    },
  },
  create: function (context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'next/script') {
          return
        }

        const document = context.getFilename().split('pages')[1]
        if (!document || !path.parse(document).name.startsWith('_document')) {
          return
        }

        context.report({
          node,
          message: `next/script should not be used in pages/_document.js. See: https://nextjs.org/docs/messages/no-script-in-document-page`,
        })
      },
    }
  },
}
