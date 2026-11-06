import type { Rule } from 'eslint'
import type * as ESTree from 'estree'
import { defineRule } from '../utils/define-rule'

const url = 'https://nextjs.org/docs/messages/no-cookies-in-mcp-tools'

/** Modules whose import marks a file as an MCP tool file. */
const TOOL_MODULES = new Set(['@next/mcp/tools'])

export default defineRule({
  meta: {
    docs: {
      description:
        'Prevent reading `cookies()` inside `@next/mcp` tool files. Tools must identify the caller with `ctx.session.auth`.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create(context) {
    let isToolFile = false
    // Local names bound to `cookies` from `next/headers`.
    const cookieBindings = new Set<string>()
    // Local names bound to the `next/headers` namespace.
    const headerNamespaces = new Set<string>()
    const calls: ESTree.CallExpression[] = []

    return {
      ImportDeclaration(node) {
        const source = node.source.value
        if (typeof source !== 'string') return
        if (TOOL_MODULES.has(source)) {
          isToolFile = true
          return
        }
        if (source !== 'next/headers') return
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name === 'cookies'
          ) {
            cookieBindings.add(specifier.local.name)
          } else if (specifier.type === 'ImportNamespaceSpecifier') {
            headerNamespaces.add(specifier.local.name)
          }
        }
      },
      CallExpression(node) {
        calls.push(node)
      },
      'Program:exit'() {
        if (!isToolFile) return
        for (const call of calls) {
          if (!isCookiesCall(call, cookieBindings, headerNamespaces)) continue
          context.report({
            node: call as Rule.Node,
            message: `Do not call \`cookies()\` in an MCP tool. It reads whatever browser session accompanies the request, which can be a different identity from the authenticated MCP caller. Use \`ctx.session.auth.current\` instead. See: ${url}`,
          })
        }
      },
    }
  },
})

function isCookiesCall(
  call: ESTree.CallExpression,
  cookieBindings: ReadonlySet<string>,
  headerNamespaces: ReadonlySet<string>
): boolean {
  const callee = call.callee
  if (callee.type === 'Identifier') return cookieBindings.has(callee.name)
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    headerNamespaces.has(callee.object.name) &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'cookies'
  )
}
