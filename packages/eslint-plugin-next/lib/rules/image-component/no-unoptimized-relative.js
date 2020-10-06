const createImageRule = require('../../utils/imageComponentRule.js')

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
  let attributesObj = {}
  node.attributes.forEach((attribute) => {
    if (!attribute.value) {
      attributesObj[attribute.name.name] = 1
    } else {
      attributesObj[attribute.name.name] = attribute.value.value
    }
  })
  return (
    attributesObj['unoptimized'] &&
    attributesObj.src &&
    !attributesObj.src.match(/^http|www/)
  )
}
