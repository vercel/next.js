import { defineRule } from '../utils/define-rule'
import {
  getStringIfConstant,
  findVariable,
} from '@eslint-community/eslint-utils'

import type * as ESTree from 'estree'
import type { SourceCode } from 'eslint'

const url =
  'https://nextjs.org/docs/messages/no-location-assign-relative-destination'

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
    const { scopeManager } = sourceCode
    if (!scopeManager) return {}

    return {
      // location.assign(...) / location['assign'](...)
      // window.location.assign(...) / window.location['assign'](...)
      // globalThis.location.assign(...) / globalThis.location['assign'](...)
      CallExpression(node) {
        const { callee, arguments: args } = node
        if (!isMemberExprWithNamedProperty(callee, 'assign')) return

        const rootIdentifier = getLocationRootIdentifier(callee.object)
        if (!rootIdentifier) return
        if (!isGlobalReference(sourceCode, rootIdentifier)) return
        if (args.length < 1) return

        const firstArg = args[0]
        if (firstArg.type === 'SpreadElement') return

        const value = getStaticStringPrefix(firstArg, sourceCode)
        if (value !== null && isRelativeUrl(value)) {
          context.report({
            node,
            messageId: 'noLocationAssign',
            data: { expression: sourceCode.getText(callee) + '()' },
          })
        }
      },

      // location.href = '/path'
      // window.location.href = '/path'
      // globalThis.location.href = '/path'
      AssignmentExpression(node) {
        const { left, right } = node
        if (!isMemberExprWithNamedProperty(left, 'href')) return

        const rootIdentifier = getLocationRootIdentifier(left.object)
        if (!rootIdentifier) return
        if (!isGlobalReference(sourceCode, rootIdentifier)) return

        const value = getStaticStringPrefix(right, sourceCode)
        if (value !== null && isRelativeUrl(value)) {
          context.report({
            node,
            messageId: 'noLocationAssign',
            data: { expression: sourceCode.getText(left) },
          })
        }
      },
    }
  },
})

const ABSOLUTE_URL_RE = /^(?:[a-z][\d+.a-z-]*:|\/\/)/i
const GLOBAL_PREFIXES = new Set(['window', 'globalThis', 'document', 'self'])

function isMemberExprWithNamedProperty(
  expr: ESTree.Node,
  name: string
): expr is ESTree.MemberExpression {
  if (expr.type !== 'MemberExpression') return false

  return expr.computed
    ? expr.property.type === 'Literal' && expr.property.value === name
    : expr.property.type === 'Identifier' && expr.property.name === name
}

function isRelativeUrl(value: string): boolean {
  return !ABSOLUTE_URL_RE.test(value)
}
function getLocationRootIdentifier(
  node: ESTree.Expression | ESTree.Super
): ESTree.Identifier | null {
  if (node.type === 'Identifier' && node.name === 'location') {
    return node
  }
  if (
    node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    GLOBAL_PREFIXES.has(node.object.name) &&
    isMemberExprWithNamedProperty(node, 'location')
  ) {
    return node.object
  }
  return null
}

function isGlobalReference(
  sourceCode: SourceCode,
  node: ESTree.Node | null
): boolean {
  if (!node) return false
  if (node.type !== 'Identifier') return false

  const variable = sourceCode.scopeManager.scopes[0].set.get(node.name)

  if (!variable || variable.defs.length > 0) return false

  return variable.references.some(({ identifier }) => identifier === node)
}

function getStaticStringPrefix(
  node: ESTree.Expression | ESTree.PrivateIdentifier,
  sourceCode: SourceCode
): string | null {
  const constantValue = getStringIfConstant(node, sourceCode.getScope(node))
  if (constantValue !== null) {
    return constantValue
  }

  if (node.type === 'TemplateLiteral' && node.quasis.length > 0) {
    return node.quasis[0].value.cooked ?? node.quasis[0].value.raw
  }

  if (node.type === 'BinaryExpression' && node.operator === '+') {
    return getStaticStringPrefix(node.left, sourceCode)
  }

  if (node.type === 'Identifier') {
    const variable = findVariable(sourceCode.getScope(node), node)
    if (!variable || variable.defs.length < 1) return null

    const def = variable.defs[variable.defs.length - 1]
    if (def.type !== 'Variable') return null

    const readPos = node.range![0]
    let lastWriteExpr: ESTree.Expression | null = def.node.init ?? null

    for (const ref of variable.references) {
      if (ref.identifier.range![0] >= readPos) break
      if (ref.isWrite() && ref.writeExpr && ref.writeExpr !== def.node.init) {
        lastWriteExpr = ref.writeExpr as ESTree.Expression
      }
    }

    if (!lastWriteExpr) return null
    return getStaticStringPrefix(lastWriteExpr, sourceCode)
  }

  return null
}
