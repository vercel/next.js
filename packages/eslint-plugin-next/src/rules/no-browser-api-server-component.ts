import { defineRule } from '../utils/define-rule'
import { isCapitalized } from '../utils/regex'

const description = 'Prevent the use of browser APIs in server components.'

const url =
  'https://nextjs.org/docs/messages/no-browser-api-in-server-component'

const browserAPIs = [
  'document',
  'window',
  'navigator',
  'location',
  'history',
  'localStorage',
  'sessionStorage',
  'fetch',
  'XMLHttpRequest',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'addEventListener',
  'removeEventListener',
  'CustomEvent',
  'Promise',
  'Worker',
  'navigator.geolocation',
  'canvas',
  'WebSocket',
  'navigator.mediaDevices.getUserMedia',
  'AudioContext',
  'history',
  'Notification',
  'navigator.serviceWorker',
  'IntersectionObserver',
  'ondragstart',
  'ondragover',
  'Element.requestFullscreen',
  'Storage',
  'navigator.clipboard',
  'Animation',
  'alert',
  'confirm',
  'prompt',
]

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
    const sourceCode = context.getSourceCode()
    const text = sourceCode.text
    const allComments = sourceCode.getAllComments()

    const isClientSideComponent = text.includes('use client')
    const isUseClientCommented = allComments.some((comment) =>
      comment.value.includes('use client')
    )

    if (isClientSideComponent && !isUseClientCommented) {
      return {}
    }

    return {
      Identifier(node) {
        let parentFunction = node.parent
        while (
          parentFunction &&
          parentFunction.type !== 'FunctionDeclaration' &&
          parentFunction.type !== 'ArrowFunctionExpression'
        ) {
          parentFunction = parentFunction.parent
        }

        if (
          browserAPIs.includes(node.name) &&
          node.name !== 'useEffect' &&
          parentFunction?.type === 'FunctionDeclaration' &&
          isCapitalized(parentFunction.id.name)
        ) {
          context.report({
            node,
            message: `${description} Avoid using \`${node.name}\` in server components. See: ${url}`,
          })
        }
      },
    }
  },
})
