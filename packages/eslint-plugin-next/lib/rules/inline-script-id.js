const url = 'https://nextjs.org/docs/messages/inline-script-id'

module.exports = {
  meta: {
    docs: {
      description:
        'Enforce `id` attribute on `next/script` components with inline content.',
      recommended: true,
      url,
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
          if (!attributeNames.has('id')) {
            context.report({
              node,
              message: `\`next/script\` components with inline content must specify an \`id\` attribute. See: ${url}`,
            })
          }
        }
      },
    }
  },
}
