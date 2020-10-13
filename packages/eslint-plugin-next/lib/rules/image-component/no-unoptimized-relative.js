const createImageRule = require('../../utils/imageComponentRule.js')
const NodeAttributes = require('../../utils/nodeAttributes.js')

module.exports = {
  meta: {
    messages: {
      noUnoptimizedRelative:
        'You are using arelaive path in the src attribute of the next/image component ' +
        'with the "unoptimized" attribute. Use absolute path or remove "unoptimized."',
    },
  },
  create: createImageRule((context, node) => {
    if (hasBadRelativePath(node)) {
      context.report({
        node,
        messageId: 'noUnoptimizedRelative',
      })
    }
  }),
}
function hasBadRelativePath(node) {
  let attributes = new NodeAttributes(node)
  return (
    attributes.has('unoptimized') &&
    attributes.has('src') &&
    !attributes.value('src').match(/^[a-zA-z\d]*:*\/\//)
  )
}
