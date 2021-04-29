const { nextImage } = require('../utils/image.js')
const NodeAttributes = require('../utils/nodeAttributes.js')

module.exports = {
  meta: {
    docs: {
      description: 'Prohibit usage of <StaticImage> for external images',
      category: 'HTML',
      recommended: true,
    },
    fixable: 'code',
  },
  create: nextImage((context, node) => {
    if (node.name.name !== 'StaticImage') {
      return
    }

    let attributes = new NodeAttributes(node)
    let srcValue = attributes.value('src')

    if (srcValue.startsWith('http')) {
      context.report({
        node,
        message:
          'Do not use StaticImage for external images that are not stored locally. See https://nextjs.org/docs/messages/no-static-image-for-external.',
      })
    }
  }),
}
