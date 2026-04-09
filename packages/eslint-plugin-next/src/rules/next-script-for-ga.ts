import { defineRule } from '../utils/define-rule'
import NodeAttributes from '../utils/node-attributes'

const GOOGLE_ANALYTICS_URL = 'www.google-analytics.com/analytics.js'
const GOOGLE_TAG_MANAGER_URL = 'www.googletagmanager.com/gtag/js'

const GOOGLE_ANALYTICS_SRC = GOOGLE_ANALYTICS_URL
const GOOGLE_TAG_MANAGER_SRC = 'www.googletagmanager.com/gtm.js'

const description =
  'Prefer `@next/third-parties/google` when using the inline script for Google Analytics and Tag Manager.'
const url = 'https://nextjs.org/docs/messages/next-script-for-ga'
const ERROR_MSG_GOOGLE_ANALYTICS = `Prefer \`GoogleAnalytics\` component from \`@next/third-parties/google\` when using the inline script for Google Analytics. See: ${url}`
const ERROR_MSG_GOOGLE_TAG_MANAGER = `Prefer \`GoogleTagManager\` component from \`@next/third-parties/google\` when using the inline script for Google Tag Manager. See: ${url}`

export default defineRule({
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

        const src = attributes.value('src')
        // Check if the Alternative async tag is being used to add GA.
        // https://developers.google.com/analytics/devguides/collection/analyticsjs#alternative_async_tag
        // https://developers.google.com/analytics/devguides/collection/gtagjs
        if (typeof src === 'string' && src.includes(GOOGLE_ANALYTICS_URL)) {
          return context.report({
            node,
            message: ERROR_MSG_GOOGLE_ANALYTICS,
          })
        } else if (
          typeof src === 'string' &&
          src.includes(GOOGLE_TAG_MANAGER_URL)
        ) {
          return context.report({
            node,
            message: ERROR_MSG_GOOGLE_TAG_MANAGER,
          })
        }

        const dangerouslySetInnerHTML = attributes.value(
          'dangerouslySetInnerHTML'
        )
        // Check if inline script is being used to add GA.
        // https://developers.google.com/analytics/devguides/collection/analyticsjs#the_google_analytics_tag
        // https://developers.google.com/tag-manager/quickstart
        if (dangerouslySetInnerHTML && dangerouslySetInnerHTML.length > 0) {
          const quasis = dangerouslySetInnerHTML[0].value.quasis
          const htmlContent = quasis?.[0]?.value?.raw
          if (htmlContent && htmlContent.includes(GOOGLE_ANALYTICS_SRC)) {
            context.report({
              node,
              message: ERROR_MSG_GOOGLE_ANALYTICS,
            })
          } else if (
            htmlContent &&
            htmlContent.includes(GOOGLE_TAG_MANAGER_SRC)
          ) {
            context.report({
              node,
              message: ERROR_MSG_GOOGLE_TAG_MANAGER,
            })
          }
        }
      },
    }
  },
})
