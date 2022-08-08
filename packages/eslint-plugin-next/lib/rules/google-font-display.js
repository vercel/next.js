const NodeAttributes = require('../utils/node-attributes.js')

const url = 'https://nextjs.org/docs/messages/google-font-display'

module.exports = {
  meta: {
    docs: {
      description: 'Enforce font-display behavior with Google Fonts.',
      recommended: true,
      url,
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
            message =
              'A font-display parameter is missing (adding `&display=optional` is recommended).'
          } else if (
            displayValue === 'auto' ||
            displayValue === 'block' ||
            displayValue === 'fallback'
          ) {
            message = `${
              displayValue[0].toUpperCase() + displayValue.slice(1)
            } is not recommended.`
          }
        }

        if (message) {
          context.report({
            node,
            message: `${message} See: ${url}`,
          })
        }
      },
    }
  },
}
