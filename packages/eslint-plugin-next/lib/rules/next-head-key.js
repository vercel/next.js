const url = 'https://nextjs.org/docs/messages/next-head-key'

module.exports = {
  meta: {
    docs: {
      description:
        'Enforce `key` attribute on `next/head` components with inline content.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create: function (context) {
    let nextHeadImportName = null

    return {
      ImportDeclaration(node) {
        if (node.source.value === 'next/head') {
          nextHeadImportName = node.specifiers[0].local.name
        }
      },
      JSXElement(node) {
        if (nextHeadImportName == null) return

        if (
          node.openingElement &&
          node.openingElement.name &&
          node.openingElement.name.name !== nextHeadImportName
        ) {
          return
        }

        const attributeNames = new Set()

        let hasNonCheckableSpreadAttribute = false
        node.openingElement.attributes.forEach((attribute) => {
          // Early return if we already have a non-checkable spread attribute, for better performance
          if (hasNonCheckableSpreadAttribute) return

          if (attribute.type === 'JSXAttribute') {
            attributeNames.add(attribute.name.name)
          } else if (attribute.type === 'JSXSpreadAttribute') {
            if (attribute.argument && attribute.argument.properties) {
              attribute.argument.properties.forEach((property) => {
                attributeNames.add(property.key.name)
              })
            } else {
              // JSXSpreadAttribute without properties is not checkable
              hasNonCheckableSpreadAttribute = true
            }
          }
        })

        // https://github.com/vercel/next.js/issues/34030
        // If there is a non-checkable spread attribute, we simply ignore them
        if (hasNonCheckableSpreadAttribute) return

        if (
          node.children.length > 0 ||
          attributeNames.has('dangerouslySetInnerHTML')
        ) {
          if (!attributeNames.has('key')) {
            context.report({
              node,
              message: `\`next/head\` components with inline content must specify an \`key\` attribute. See: ${url}`,
            })
          }
        }
      },
    }
  },
}
