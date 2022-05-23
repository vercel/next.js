const path = require('path')

module.exports = {
  meta: {
    docs: {
      description: 'Disallow using custom styled-jsx inside pages/_document.js',
      recommended: true,
      url: 'https://nextjs.org/docs/messages/no-styled-jsx-in-document',
    },
    fixable: 'code',
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
            message: `Do not use styled-jsx inside pages/_document.js. See https://nextjs.org/docs/messages/no-styled-jsx-in-document.`,
          })
        }
      },
    }
  },
}

module.exports.schema = []
