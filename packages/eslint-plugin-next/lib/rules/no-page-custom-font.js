const NodeAttributes = require('../utils/nodeAttributes.js')

module.exports = {
  meta: {
    docs: {
      description:
        'Recommend adding custom font in a custom document and not in a specific page',
      recommended: true,
    },
  },
  create: function (context) {
    let documentImport = false
    let documentClass = false
    return {
      ImportDeclaration(node) {
        if (node.source.value === 'next/document') {
          if (node.specifiers.some(({ local }) => local.name === 'Document')) {
            documentImport = true
          }
        }
      },
      ClassDeclaration(node) {
        if (node.superClass && node.superClass.name === 'Document') {
          documentClass = true
        }
      },
      JSXOpeningElement(node) {
        if ((documentImport && documentClass) || node.name.name !== 'link') {
          return
        }

        const attributes = new NodeAttributes(node)
        if (!attributes.has('href') || !attributes.hasValue('href')) {
          return
        }

        const hrefValue = attributes.value('href')
        const isGoogleFont = hrefValue.includes(
          'https://fonts.googleapis.com/css'
        )

        if (isGoogleFont) {
          context.report({
            node,
            message:
              'Custom fonts should be added at the document level. See https://nextjs.org/docs/messages/no-page-custom-font.',
          })
        }
      },
    }
  },
}
