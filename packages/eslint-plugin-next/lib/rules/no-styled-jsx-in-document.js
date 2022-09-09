const path = require('path')

const url = 'https://nextjs.org/docs/messages/no-styled-jsx-in-document'

module.exports = {
  meta: {
    docs: {
      description: 'Prevent usage of `styled-jsx` in `pages/_document.js`.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create: function (context) {
    return {
      JSXOpeningElement(node) {
        const document = context.getFilename().split('pages')[1]
        if (!document) {
          return
        }
        const { name, dir } = path.parse(document)

        if (
          !(
            name.startsWith('_document') ||
            (dir === '/_document' && name === 'index')
          )
        ) {
          return
        }

        if (
          node.name.name === 'style' &&
          node.attributes.find(
            (attr) => attr.type === 'JSXAttribute' && attr.name.name === 'jsx'
          )
        ) {
          context.report({
            node,
            message: `\`styled-jsx\` should not be used in \`pages/_document.js\`. See: ${url}`,
          })
        }
      },
    }
  },
}
