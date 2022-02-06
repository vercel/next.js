module.exports = {
  meta: {
    docs: {
      description:
        'next/script components with inline content must specify an `id` attribute.',
      recommended: true,
      url: 'https://nextjs.org/docs/messages/inline-script-id',
    },
  },
  create: function (context) {
    let nextScriptImportName = null

    return {
      ImportDeclaration(node) {
        if (node.source.value === 'next/script') {
          nextScriptImportName = node.specifiers[0].local.name
        }
      },
      JSXElement(node) {
        if (nextScriptImportName == null) return

        if (
          node.openingElement &&
          node.openingElement.name &&
          node.openingElement.name.name !== nextScriptImportName
        ) {
          return
        }

        const attributeNames = new Set()
        node.openingElement.attributes.forEach((attribute) => {
          if (attribute.type === 'JSXAttribute') {
            attributeNames.add(attribute.name.name)
          } else if (attribute.type === 'JSXSpreadAttribute') {
            attribute.argument.properties.forEach((property) => {
              attributeNames.add(property.key.name)
            })
          }
        })

        if (
          node.children.length > 0 ||
          attributeNames.has('dangerouslySetInnerHTML')
        ) {
          if (!attributeNames.has('id')) {
            context.report({
              node,
              message:
                'next/script components with inline content must specify an `id` attribute. See: https://nextjs.org/docs/messages/inline-script-id',
            })
          }
        }
      },
    }
  },
}
