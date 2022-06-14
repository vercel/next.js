const path = require('path')

const url = 'https://nextjs.org/docs/messages/no-document-import-in-page'

module.exports = {
  meta: {
    docs: {
      description:
        'Prevent importing `next/document` outside of `pages/_document.js`.',
      recommended: true,
      url,
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
          message: `\`<Document />\` from \`next/document\` should not be imported outside of \`pages/_document.js\`. See: ${url}`,
        })
      },
    }
  },
}
