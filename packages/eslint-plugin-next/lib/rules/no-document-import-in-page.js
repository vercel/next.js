const path = require('path')

module.exports = {
  meta: {
    docs: {
      description:
        'Disallow importing next/document outside of pages/document.js',
      recommended: true,
    },
  },
  create: function (context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'next/document') {
          return
        }

        const page = context.getFilename().split('pages')[1]
        if (!page || path.parse(page).name.startsWith('_document')) {
          return
        }

        context.report({
          node,
          message: `next/document should not be imported outside of pages/_document.js. See https://nextjs.org/docs/messages/no-document-import-in-page.`,
        })
      },
    }
  },
}
