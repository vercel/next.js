const url = 'https://nextjs.org/docs/messages/no-head-element'

module.exports = {
  meta: {
    docs: {
      description: 'Prevent usage of `<head>` element.',
      category: 'HTML',
      recommended: true,
      url,
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
          message: `Do not use \`<head>\` element. Use \`<Head />\` from \`next/head\` instead. See: ${url}`,
        })
      },
    }
  },
}
