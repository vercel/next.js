const path = require('path')

const url = 'https://nextjs.org/docs/messages/no-script-in-document'

module.exports = {
  meta: {
    docs: {
      description: 'Prevent usage of `next/script` in `pages/_document.js`.',
      recommended: true,
      url,
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
          message: `\`<Script />\` from \`next/script\` should not be used in \`pages/_document.js\`. Use in \`pages/_app.js\` instead. See: ${url}`,
        })
      },
    }
  },
}
