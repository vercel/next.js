const path = require('path')

module.exports = {
  meta: {
    docs: {
      description:
        'Disallow using next/script beforeInteractive strategy outside the next/_document component',
      recommended: true,
      url: 'https://nextjs.org/docs/messages/no-before-interactive-script-outside-document',
    },
  },
  create: function (context) {
    let scriptImportName = null

    return {
      'ImportDeclaration[source.value="next/script"] > ImportDefaultSpecifier'(
        node
      ) {
        scriptImportName = node.local.name
      },
      JSXOpeningElement(node) {
        if (!scriptImportName) {
          return
        }

        if (node.name && node.name.name !== scriptImportName) {
          return
        }

        const strategy = node.attributes.find(
          (child) => child.name && child.name.name === 'strategy'
        )

        if (!strategy || strategy?.value?.value !== 'beforeInteractive') {
          return
        }

        const document = context.getFilename().split('pages')[1]
        if (document && path.parse(document).name.startsWith('_document')) {
          return
        }

        context.report({
          node,
          message:
            'next/script beforeInteractive strategy should only be used inside next/_document. See: https://nextjs.org/docs/messages/no-before-interactive-script-outside-document',
        })
      },
    }
  },
}
