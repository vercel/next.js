const NodeAttributes = require('../utils/node-attributes.js')

module.exports = {
  meta: {
    docs: {
      description: 'Ensure preconnect is used with Google Fonts',
      recommended: true,
    },
  },
  create: function (context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.name !== 'link') {
          return
        }

        const attributes = new NodeAttributes(node)
        if (!attributes.has('href') || !attributes.hasValue('href')) {
          return
        }

        const hrefValue = attributes.value('href')
        const preconnectMissing =
          !attributes.has('rel') ||
          !attributes.hasValue('rel') ||
          attributes.value('rel') !== 'preconnect'

        if (
          typeof hrefValue === 'string' &&
          hrefValue.startsWith('https://fonts.gstatic.com') &&
          preconnectMissing
        ) {
          context.report({
            node,
            message: `Preconnect is missing. See https://nextjs.org/docs/messages/google-font-preconnect.`,
          })
        }
      },
    }
  },
}
