const createImageRule = require('../../utils/imageComponentRule.js')

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
  let attributesObj = {}
  node.attributes.forEach((attribute) => {
    if (!attribute.value) {
      attributesObj[attribute.name.name] = 1
    } else {
      attributesObj[attribute.name.name] = attribute.value.value
    }
  })
  return (
    !attributesObj['unoptimized'] &&
    attributesObj.src &&
    attributesObj.src.match(/^http|www/)
  )
}
