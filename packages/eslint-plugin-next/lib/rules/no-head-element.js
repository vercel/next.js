module.exports = {
  meta: {
    docs: {
      description: 'Prohibit usage of HTML <head> element',
      category: 'HTML',
      recommended: true,
      url: 'https://nextjs.org/docs/messages/no-head-element',
    },
    fixable: 'code',
  },

  create: function (context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.name !== 'head') {
          return
        }

        context.report({
          node,
          message: `Do not use <head>. Use Head from 'next/head' instead. See: https://nextjs.org/docs/messages/no-head-element`,
        })
      },
    }
  },
}
