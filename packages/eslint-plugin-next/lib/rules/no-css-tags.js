module.exports = function(context) {
  return {
    JSXOpeningElement(node) {
      if (node.name.name !== 'link') {
        return
      }
      if (node.attributes.length === 0) {
        return
      }

      if (
        node.attributes.find(
          attr => attr.name.name === 'rel' && attr.value.value === 'stylesheet'
        ) &&
        node.attributes.find(
          attr => attr.name.name === 'href' && !/^https?/.test(attr.value.value)
        )
      ) {
        context.report({
          node,
          message:
            'In order to use external stylesheets use @import in the root stylesheet compiled with NextJS. This ensures proper priority to CSS when loading a webpage.',
        })
      }
    },
  }
}

module.exports.schema = []
