module.exports = {
  meta: {
    docs: {
      description: 'Disallow using <title> with Head from next/document',
      recommended: true,
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

        const titleTag = node.children.find(
          (child) =>
            child.openingElement &&
            child.openingElement.name &&
            child.openingElement.name.name === 'Script'
        )

        if (titleTag) {
          context.report({
            node,
            message: "Script shouldn't be used inside <Head></Head>",
          })
        }
      },
    }
  },
}
