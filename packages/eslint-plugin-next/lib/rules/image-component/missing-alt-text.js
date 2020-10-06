const createImageRule = require('../../utils/imageComponentRule.js')

module.exports = {
  meta: {
    messages: {
      missingAltText:
        'All images should have an alt property for descriptive text. ' +
        'Purely decorative images can use an empty alt attribute.' +
        'See: https://web.dev/image-alt/',
    },
  },
  create: createImageRule((context, node) => {
    if (!imageHasAltText(node)) {
      context.report({
        node,
        messageId: 'missingAltText',
      })
    }
  }),
}

function imageHasAltText(node) {
  let attributes = node.attributes.map((attribute) => attribute.name.name)
  return attributes.includes('alt')
}
