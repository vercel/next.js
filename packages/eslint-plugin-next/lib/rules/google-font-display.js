const NodeAttributes = require('../utils/node-attributes.js')

module.exports = {
  meta: {
    docs: {
      description:
        'Ensure correct font-display property is assigned for Google Fonts',
      recommended: true,
      url: 'https://nextjs.org/docs/messages/google-font-display',
    },
  },
  create: function (context) {
    return {
      JSXOpeningElement(node) {
        let message

        if (node.name.name !== 'link') {
          return
        }

        const attributes = new NodeAttributes(node)
        if (!attributes.has('href') || !attributes.hasValue('href')) {
          return
        }

        const hrefValue = attributes.value('href')
        const isGoogleFont =
          typeof hrefValue === 'string' &&
          hrefValue.startsWith('https://fonts.googleapis.com/css')

        if (isGoogleFont) {
          const params = new URLSearchParams(hrefValue.split('?')[1])
          const displayValue = params.get('display')

          if (!params.has('display')) {
            message = 'Display parameter is missing.'
          } else if (
            displayValue === 'block' ||
            displayValue === 'fallback' ||
            displayValue === 'auto'
          ) {
            message = `${
              displayValue[0].toUpperCase() + displayValue.slice(1)
            } behavior is not recommended.`
          }
        }

        if (message) {
          context.report({
            node,
            message: `${message} See https://nextjs.org/docs/messages/google-font-display.`,
          })
        }
      },
    }
  },
}
