const url = 'https://nextjs.org/docs/messages/no-sync-scripts'

module.exports = {
  meta: {
    docs: {
      description: 'Prevent synchronous scripts.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create: function (context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.name !== 'script') {
          return
        }
        if (node.attributes.length === 0) {
          return
        }
        const attributeNames = node.attributes
          .filter((attr) => attr.type === 'JSXAttribute')
          .map((attr) => attr.name.name)
        if (
          attributeNames.includes('src') &&
          !attributeNames.includes('async') &&
          !attributeNames.includes('defer')
        ) {
          context.report({
            node,
            message: `Synchronous scripts should not be used. See: ${url}`,
          })
        }
      },
    }
  },
}
