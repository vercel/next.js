const NodeAttributes = require('../utils/nodeAttributes.js')

module.exports = {
  meta: {
    docs: {
      description:
        'Ensure passHref is assigned if child of Link component is a custom component',
      category: 'HTML',
      recommended: true,
    },
    fixable: null,
  },

  create: function (context) {
    return {
      JSXOpeningElement(node) {
        const attributes = new NodeAttributes(node)
        const children = node.parent.children

        if (node.name.name !== 'Link') {
          return
        }

        if (
          !attributes.hasAny() ||
          !attributes.has('href') ||
          !children.some((attr) => attr.type === 'JSXElement')
        ) {
          return
        }

        const hasPassHref =
          attributes.has('passHref') &&
          (typeof attributes.value('passHref') === 'undefined' ||
            attributes.value('passHref') === true)

        const hasAnchorChild = children.some(
          (attr) =>
            attr.type === 'JSXElement' &&
            attr.openingElement.name.name === 'a' &&
            attr.closingElement.name.name === 'a'
        )

        if (!hasAnchorChild && !hasPassHref) {
          context.report({
            node,
            message: `passHref ${
              attributes.value('passHref') !== true
                ? 'must be set to true'
                : 'is missing'
            }. See https://nextjs.org/docs/messages/link-passhref.`,
          })
        }
      },
    }
  },
}
