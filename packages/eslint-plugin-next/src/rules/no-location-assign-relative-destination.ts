import { defineRule } from '../utils/define-rule'

const url =
  'https://nextjs.org/docs/messages/no-location-assign-relative-destination'

const LOCATION_GLOBALS = new Set(['window', 'globalThis', 'document', 'self'])

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
  return memberNode.computed
    ? memberNode.property.type === 'Literal' &&
        memberNode.property.value === name
    : memberNode.property.type === 'Identifier' &&
        memberNode.property.name === name
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

/**
 * Returns the base `Identifier` node for a `location`-object reference — i.e.
 * the identifier whose scope we need to check to know if it refers to the
 * browser global. For `location`, the identifier is itself; for
 * `window.location` / `globalThis.location`, the base is `window`/`globalThis`.
 */
function getLocationBaseIdentifier(locationNode: any): any {
  if (locationNode.type === 'Identifier') {
    return locationNode
  }
  // MemberExpression: window.location / globalThis.location
  return locationNode.object
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
          // Allow calls where the base identifier (location/window/globalThis)
          // refers to a locally declared variable, not the browser global.
          const base = getLocationBaseIdentifier(callee.object)
          if (!isGlobalReference(base)) {
            return
          }
          context.report({
            node,
            messageId: 'noLocationAssign',
            data: { expression: sourceCode.getText(callee) + '()' },
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
          // Allow assignments where the base identifier (location/window/globalThis)
          // refers to a locally declared variable, not the browser global.
          const base = getLocationBaseIdentifier(left.object)
          if (!isGlobalReference(base)) {
            return
          }
          context.report({
            node,
            messageId: 'noLocationAssign',
            data: { expression: sourceCode.getText(left) },
          })
        }
      },
    }

    // By inline this helper function with create, I can have typed sourceCode.scopeManager
    function isGlobalReference(node): boolean {
      if (!node) return false
      if (node.type !== 'Identifier') return false

      const variable = sourceCode.scopeManager.scopes[0].set.get(node.name)

      if (!variable || variable.defs.length > 0) return false

      return variable.references.some(({ identifier }) => identifier === node)
    }
  },
})
