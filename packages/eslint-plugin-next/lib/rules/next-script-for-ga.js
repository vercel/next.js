const NodeAttributes = require('../utils/nodeAttributes.js')

const GA_URL = 'www.google-analytics.com/analytics.js'
const ERROR_MSG =
  'Use the Script component for loading third party scripts. See: https://nextjs.org/docs/messages/next-script-for-ga.'

module.exports = {
  meta: {
    docs: {
      description:
        'Prefer next script component when using the inline script for Google Analytics',
      recommended: true,
    },
  },
  create: function (context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.name !== 'script') {
          return
        }
        if (node.attributes.length === 0) {
          return
        }
        const attributes = new NodeAttributes(node)

        // Check if the Alternative async tag is being used to add GA. https://developers.google.com/analytics/devguides/collection/analyticsjs#alternative_async_tag
        if (
          typeof attributes.value('src') === 'string' &&
          attributes.value('src').includes(GA_URL)
        ) {
          return context.report({
            node,
            message: ERROR_MSG,
          })
        }

        // Check if inline script is being used to add GA. https://developers.google.com/analytics/devguides/collection/analyticsjs#the_google_analytics_tag
        if (
          attributes.has('dangerouslySetInnerHTML') &&
          attributes.value('dangerouslySetInnerHTML')[0]
        ) {
          const htmlContent = attributes.value('dangerouslySetInnerHTML')[0]
            .value.quasis[0].value.raw

          if (
            htmlContent &&
            htmlContent.includes('www.google-analytics.com/analytics.js')
          ) {
            context.report({
              node,
              message: ERROR_MSG,
            })
          }
        }
      },
    }
  },
}

module.exports.schema = []
