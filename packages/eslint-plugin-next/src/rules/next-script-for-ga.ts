import { defineRule } from '../utils/define-rule'
import NodeAttributes from '../utils/node-attributes'

const SUPPORTED_SRCS = [
  'www.google-analytics.com/analytics.js',
  'www.googletagmanager.com/gtag/js',
]
const SUPPORTED_HTML_CONTENT_URLS = [
  'www.google-analytics.com/analytics.js',
]
const description =
  'Prefer `next/script` component when using the inline script for Google Analytics.'
const url = 'https://nextjs.org/docs/messages/next-script-for-ga'
const ERROR_MSG = `${description} See: ${url}`

// Check if one of the items in the list is a substring of the passed string
const containsStr = (str, strList) => {
  return strList.some((s) => str.includes(s))
}

export = defineRule({
  meta: {
    docs: {
      description,
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.name !== 'script') {
          return
        }
        if (node.attributes.length === 0) {
          return
        }
        const attributes = new NodeAttributes(node)

        // Check if the Alternative async tag is being used to add GA.
        // https://developers.google.com/analytics/devguides/collection/analyticsjs#alternative_async_tag
        // https://developers.google.com/analytics/devguides/collection/gtagjs
        if (
          typeof attributes.value('src') === 'string' &&
          containsStr(attributes.value('src'), SUPPORTED_SRCS)
        ) {
          return context.report({
            node,
            message: ERROR_MSG,
          })
        }

        // Check if inline script is being used to add GA.
        // https://developers.google.com/analytics/devguides/collection/analyticsjs#the_google_analytics_tag
        // https://developers.google.com/tag-manager/quickstart
        if (
          attributes.value('dangerouslySetInnerHTML') &&
          attributes.value('dangerouslySetInnerHTML').length > 0
        ) {
          const htmlContent =
            attributes.value('dangerouslySetInnerHTML')[0].value.quasis &&
            attributes.value('dangerouslySetInnerHTML')[0].value.quasis[0].value
              .raw
          if (
            htmlContent &&
            containsStr(htmlContent, SUPPORTED_HTML_CONTENT_URLS)
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
})
