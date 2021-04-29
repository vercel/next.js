module.exports = function (context) {
  return {
    JSXOpeningElement(node) {
      if (node.name.name !== 'link') {
        return
      }
      if (node.attributes.length === 0) {
        return
      }

      const attributes = node.attributes.filter(
        (attr) => attr.type === 'JSXAttribute'
      )
      if (
        attributes.find(
          (attr) =>
            attr.name.name === 'rel' && attr.value.value === 'stylesheet'
        ) &&
        attributes.find(
          (attr) =>
            attr.name.name === 'href' &&
            attr.value.type === 'Literal' &&
            !/^https?/.test(attr.value.value)
        )
      ) {
        context.report({
          node,
          message:
            'Do not include stylesheets manually. See: https://nextjs.org/docs/messages/no-css-tags.',
        })
      }
    },
  }
}

module.exports.schema = []
