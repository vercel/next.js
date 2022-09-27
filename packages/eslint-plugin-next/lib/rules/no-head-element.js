const url = 'https://nextjs.org/docs/messages/no-head-element'

module.exports = {
  meta: {
    docs: {
      description: 'Prevent usage of `<head>` element.',
      category: 'HTML',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create: function (context) {
    return {
      JSXOpeningElement(node) {
        const paths = context.getFilename()

        const isInAppDir = paths.includes('app/') && !paths.includes('pages/')
        // Only lint the <head> element in pages directory
        if (node.name.name !== 'head' || isInAppDir) {
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
