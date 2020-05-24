module.exports = function(context) {
  return {
    JSXOpeningElement(node) {
      if (node.name.name !== 'script') {
        return
      }
      if (node.attributes.length === 0) {
        return
      }

      if (
        node.attributes.find(attr => attr.name.name === 'src') &&
        !node.attributes.find(
          attr => attr.name.name === 'async' || attr.name.name === 'defer'
        )
      ) {
        context.report({
          node,
          message:
            "A synchronous script tag can impact your webpage's performance",
        })
      }
    },
  }
}

module.exports.schema = []
