const url = 'https://nextjs.org/docs/messages/next-head-key'

module.exports = {
  meta: {
    docs: {
      description:
        'Enforce `key` attribute in all the children components of `next/head`.',
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

        node.children.forEach((child) => {
          attributeNames.clear()

          if (
            child.openingElement &&
            child.openingElement.name &&
            child.openingElement.name.type === 'JSXIdentifier' &&
            child.openingElement.name.name !== 'title'
          ) {
            child.openingElement.attributes.forEach((attribute) => {
              // Early return if we already have a non-checkable spread attribute, for better performance

              if (attribute.type === 'JSXAttribute') {
                attributeNames.add(attribute.name.name)
              } else if (attribute.type === 'JSXSpreadAttribute') {
                if (attribute.argument && attribute.argument.properties) {
                  attribute.argument.properties.forEach((property) => {
                    attributeNames.add(property.key.name)
                  })
                }
              }
            })

            if (attributeNames.size > 0 && !attributeNames.has('key')) {
              context.report({
                node,
                message: `Children components of \`next/head\` must specify a \`key\` attribute. See: ${url}`,
              })
            }
          }
        })
      },
    }
  },
}
