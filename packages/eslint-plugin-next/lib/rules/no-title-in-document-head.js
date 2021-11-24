module.exports = {
  meta: {
    docs: {
      description: 'Disallow using <title> with Head from next/document',
    },
  },
  create: function (context) {
    let headFromNextDocument = false
    return {
      ImportDeclaration(node) {
        if (node.source.value === 'next/document') {
          if (node.specifiers.some(({ local }) => local.name === 'Head')) {
            headFromNextDocument = true
          }
        }
      },
      JSXElement(node) {
        if (!headFromNextDocument) {
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
            child.openingElement.name.type === 'JSXIdentifier' &&
            child.openingElement.name.name === 'title'
        )

        if (titleTag) {
          context.report({
            node: titleTag,
            message:
              'Titles should be defined at the page-level using next/head. See https://nextjs.org/docs/messages/no-title-in-document-head.',
          })
        }
      },
    }
  },
}
