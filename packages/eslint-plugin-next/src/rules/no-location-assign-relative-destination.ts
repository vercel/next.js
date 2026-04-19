import { defineRule } from '../utils/define-rule'

const url =
  'https://nextjs.org/docs/messages/no-location-assign-relative-destination'

const LOCATION_GLOBALS = new Set(['window', 'globalThis'])

function isLocationObject(node: any): boolean {
  // `location`
  if (node.type === 'Identifier' && node.name === 'location') {
    return true
  }
  // `window.location` / `globalThis.location` (dot or bracket notation)
  if (
    node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    LOCATION_GLOBALS.has(node.object.name) &&
    isPropertyNamed(node, 'location')
  ) {
    return true
  }
  return false
}

function isPropertyNamed(memberNode: any, name: string): boolean {
  return (
    (memberNode.computed === false &&
      memberNode.property.type === 'Identifier' &&
      memberNode.property.name === name) ||
    (memberNode.computed === true &&
      memberNode.property.type === 'Literal' &&
      memberNode.property.value === name)
  )
}

/** Returns true when the node is a string literal containing "://" (absolute URL). */
function isAbsoluteUrlLiteral(node: any): boolean {
  return (
    node != null &&
    node.type === 'Literal' &&
    typeof node.value === 'string' &&
    node.value.includes('://')
  )
}

export default defineRule({
  meta: {
    docs: {
      description:
        'Prevent usage of `location.assign` or `location.href` assignment to navigate to internal Next.js pages.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
    messages: {
      noLocationAssign:
        "Do not use `{{expression}}` to navigate to internal Next.js pages. Use `redirect()` in the render phase, or `useRouter().push()` in Client Components' event handlers instead. See: " +
        url,
    },
  },

  create(context) {
    const { sourceCode } = context
    return {
      // location.assign(...) / location['assign'](...)
      // window.location.assign(...) / window.location['assign'](...)
      // globalThis.location.assign(...) / globalThis.location['assign'](...)
      CallExpression(node) {
        const callee = node.callee
        if (
          callee.type === 'MemberExpression' &&
          isPropertyNamed(callee, 'assign') &&
          isLocationObject(callee.object)
        ) {
          // Allow calls where the first argument is an absolute URL string literal
          if (isAbsoluteUrlLiteral(node.arguments[0])) {
            return
          }
          const expression = sourceCode.getText(callee)
          context.report({
            node,
            messageId: 'noLocationAssign',
            data: { expression: expression + '()' },
          })
        }
      },

      // location.href = ... / location['href'] = ...
      // window.location.href = ... / window.location['href'] = ...
      // globalThis.location.href = ... / globalThis.location['href'] = ...
      AssignmentExpression(node) {
        const left = node.left
        if (
          left.type === 'MemberExpression' &&
          isPropertyNamed(left, 'href') &&
          isLocationObject(left.object)
        ) {
          // Allow assignments where the right-hand side is an absolute URL string literal
          if (isAbsoluteUrlLiteral(node.right)) {
            return
          }
          const expression = sourceCode.getText(left)
          context.report({
            node,
            messageId: 'noLocationAssign',
            data: { expression },
          })
        }
      },
    }
  },
})
