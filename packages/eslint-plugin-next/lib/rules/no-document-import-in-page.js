const path = require('path')

module.exports = {
  meta: {
    docs: {
      description:
        'Disallow importing next/document outside of pages/document.js',
      recommended: true,
      url: 'https://nextjs.org/docs/messages/no-document-import-in-page',
    },
  },
  create: function (context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'next/document') {
          return
        }

        const paths = context.getFilename().split('pages')
        const page = paths[paths.length - 1]

        if (
          !page ||
          page.startsWith(`${path.sep}_document`) ||
          page.startsWith(`${path.posix.sep}_document`)
        ) {
          return
        }

        context.report({
          node,
          message: `next/document should not be imported outside of pages/_document.js. See: https://nextjs.org/docs/messages/no-document-import-in-page`,
        })
      },
    }
  },
}
