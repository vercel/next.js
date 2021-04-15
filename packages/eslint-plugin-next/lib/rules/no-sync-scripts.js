module.exports = function (context) {
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
          message:
            'Synchronous scripts are forbidden. See: https://nextjs.org/docs/messages/no-sync-scripts.',
        })
      }
    },
  }
}

module.exports.schema = []
