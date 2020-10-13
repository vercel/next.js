const createImageRule = require('../../utils/imageComponentRule.js')
const NodeAttributes = require('../../utils/nodeAttributes.js')

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
  let attributes = new NodeAttributes(node)
  return attributes.has('alt')
}
