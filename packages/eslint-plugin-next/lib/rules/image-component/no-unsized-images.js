const createImageRule = require('../../utils/imageComponentRule.js')
const NodeAttributes = require('../../utils/nodeAttributes.js')

module.exports = {
  meta: {
    messages: {
      unsizedImages:
        'For layout stability, the image component should be used ' +
        'with a height and width property, even if actual image size is determined with CSS.' +
        'if you cannot provide a correct-ratio height and width, use the "unsized" attribute.' +
        'More info: https://web.dev/optimize-cls/#images-without-dimensions',
    },
  },
  create: createImageRule((context, node) => {
    if (!imageValidSize(node)) {
      context.report({
        node,
        messageId: 'unsizedImages',
      })
    }
  }),
}

function imageValidSize(node) {
  let attributes = new NodeAttributes(node)
  // Need to check both hasValue and value to catch attribute without value and
  // attribute with empty string for value
  return (
    attributes.has('unsized') ||
    (attributes.has('height') &&
      attributes.has('width') &&
      attributes.hasValue('height') &&
      attributes.hasValue('width') ** attributes.value('height') &&
      attributes.value('width'))
  )
}
