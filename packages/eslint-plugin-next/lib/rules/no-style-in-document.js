const path = require('path')

module.exports = {
  meta: {
    docs: {
      description: 'Disallow using custom styles inside pages/_document.js',
      recommended: true,
    },
    fixable: 'code',
  },
  create: function (context) {
    return {
      ImportDeclaration(node) {
        const document = context.getFilename().split('pages')[1]
        if (!document || !path.parse(document).name.startsWith('_document')) {
          return
        }
      },
      JSXElement(node) {
        const styleTag = node.children.find(
          (child) =>
            child.openingElement &&
            child.openingElement.name &&
            child.openingElement.name.type === 'JSXIdentifier' &&
            child.openingElement.name.name === 'style'
        )

        if (styleTag) {
          context.report({
            node,
            message: `Do not use <style> inside pages/_document.js.`,
          })
        }
      },
    }
  },
}

module.exports.schema = []
