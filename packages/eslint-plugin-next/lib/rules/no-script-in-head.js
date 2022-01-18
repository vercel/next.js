module.exports = {
  meta: {
    docs: {
      description: 'Disallow using next/script inside the next/head component',
      recommended: true,
      url: 'https://nextjs.org/docs/messages/no-script-in-head-component',
    },
  },
  create: function (context) {
    let isNextHead = null

    return {
      ImportDeclaration(node) {
        if (node.source.value === 'next/head') {
          isNextHead = node.source.value
        }

        if (node.source.value !== 'next/script') {
          return
        }
      },
      JSXElement(node) {
        if (!isNextHead) {
          return
        }

        if (
          node.openingElement &&
          node.openingElement.name &&
          node.openingElement.name.name !== 'Head'
        ) {
          return
        }

        const scriptTag = node.children.find(
          (child) =>
            child.openingElement &&
            child.openingElement.name &&
            child.openingElement.name.name === 'Script'
        )

        if (scriptTag) {
          context.report({
            node,
            message:
              "next/script shouldn't be used inside next/head. See: https://nextjs.org/docs/messages/no-script-in-head-component",
          })
        }
      },
    }
  },
}
