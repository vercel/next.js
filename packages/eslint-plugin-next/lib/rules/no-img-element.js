module.exports = {
  meta: {
    docs: {
      description: 'Prohibit usage of HTML <img> element',
      category: 'HTML',
      recommended: true,
      url: 'https://nextjs.org/docs/messages/no-img-element',
    },
    fixable: 'code',
  },

  create: function (context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.name !== 'img') {
          return
        }

        if (node.attributes.length === 0) {
          return
        }

        context.report({
          node,
          message: `Do not use <img>. Use Image from 'next/image' instead. See: https://nextjs.org/docs/messages/no-img-element`,
        })
      },
    }
  },
}
