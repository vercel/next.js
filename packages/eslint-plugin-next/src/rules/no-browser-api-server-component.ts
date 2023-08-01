import { defineRule } from '../utils/define-rule'

const description = 'Prevent the use of browser APIs in server components.'

const url =
  'https://nextjs.org/docs/messages/no-browser-api-in-server-component'

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
    let inUseEffectHook = false
    const sourceCode = context.getSourceCode()
    const text = sourceCode.text
    const allComments = sourceCode.getAllComments()

    const useClientInText = text.includes('use client')
    const useClientInComments = allComments.some((comment) =>
      comment.value.includes('use client')
    )

    if (useClientInText && !useClientInComments) {
      return {}
    }

    return {
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'useEffect'
        ) {
          inUseEffectHook = true
        }
      },
      'CallExpression:exit'(node) {
        // Check if we're leaving a useEffect hook
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'useEffect'
        ) {
          inUseEffectHook = false
        }
      },
      Identifier(node) {
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

        if (
          !inUseEffectHook &&
          browserAPIs.includes(node.name) &&
          node.name !== 'useEffect'
        ) {
          context.report({
            node,
            message: `Do not use ${node.name} outside of a useEffect hook in a server component.`,
          })
        }
      },
    }
  },
})
