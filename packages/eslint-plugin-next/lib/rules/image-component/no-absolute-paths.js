const createImageRule = require('../../utils/imageComponentRule.js')
const NodeAttributes = require('../../utils/nodeAttributes.js')

module.exports = {
  meta: {
    messages: {
      noAbsolutePaths:
        'You are using an absolute path in the src attribute of the next/image component.' +
        'This is almost definitely a mistake--use the "unoptimized" attribute to use ' +
        'an absolute path with no loader or optimizations.',
    },
  },
  create: createImageRule((context, node) => {
    if (hasBadAbsolutePath(node)) {
      context.report({
        node,
        messageId: 'noAbsolutePaths',
      })
    }
  }),
}
function hasBadAbsolutePath(node) {
  let attributes = new NodeAttributes(node)
  return (
    !attributes.has('unoptimized') &&
    attributes.has('src') &&
    typeof attributes.value('src') === 'string' &&
    attributes.value('src').match(/^[a-zA-z\d]*:*\/\//)
  )
}
