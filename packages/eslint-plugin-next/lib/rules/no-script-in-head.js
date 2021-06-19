module.exports = {
  meta: {
    docs: {
      description: 'Disallow using <title> with Head from next/document',
    },
  },
  create: function (context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'next/script') {
          return
        }
      },
      JSXElement(node) {
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
            node: titleTag,
            message: "Script shouldn't be used inside <Head></Head>",
          })
        }
      },
    }
  },
}
