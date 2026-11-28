import { findVariable } from '@eslint-community/eslint-utils'
import type { Rule, SourceCode } from 'eslint'
import type * as ESTree from 'estree'
import { defineRule } from '../utils/define-rule'

const url = 'https://nextjs.org/docs/messages/no-cookies-in-mcp-tools'

/** Modules whose runtime imports mark a file as an MCP tool file. */
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
    const { sourceCode } = context
    let isToolFile = false
    // Declaration identifiers, not spellings: parameters can shadow imports.
    const cookieBindings = new Set<ESTree.Identifier>()
    const headerNamespaces = new Set<ESTree.Identifier>()
    const calls: ESTree.CallExpression[] = []

    return {
      ImportDeclaration(node) {
        const source = node.source.value
        if (typeof source !== 'string' || isTypeOnlyImport(node)) return
        if (TOOL_MODULES.has(source)) {
          isToolFile ||=
            node.specifiers.length === 0 ||
            node.specifiers.some((specifier) => !isTypeOnlyImport(specifier))
          return
        }
        if (source !== 'next/headers') return
        for (const specifier of node.specifiers) {
          if (isTypeOnlyImport(specifier)) continue
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name === 'cookies'
          ) {
            cookieBindings.add(specifier.local)
          } else if (specifier.type === 'ImportNamespaceSpecifier') {
            headerNamespaces.add(specifier.local)
          }
        }
      },
      CallExpression(node) {
        calls.push(node)
      },
      'Program:exit'() {
        if (!isToolFile) return
        for (const call of calls) {
          if (
            !isCookiesCall(call, cookieBindings, headerNamespaces, sourceCode)
          ) {
            continue
          }
          context.report({
            node: call as Rule.Node,
            message: `Do not call \`cookies()\` in an MCP tool. It reads whatever browser session accompanies the request, which can be a different identity from the authenticated MCP caller. Use \`ctx.session.auth.current\` instead. See: ${url}`,
          })
        }
      },
    }
  },
})

function isTypeOnlyImport(node: ESTree.Node): boolean {
  return 'importKind' in node && node.importKind === 'type'
}

function isCookiesCall(
  call: ESTree.CallExpression,
  cookieBindings: ReadonlySet<ESTree.Identifier>,
  headerNamespaces: ReadonlySet<ESTree.Identifier>,
  sourceCode: SourceCode
): boolean {
  const callee = call.callee
  if (callee.type === 'Identifier') {
    return isImportedBinding(callee, cookieBindings, sourceCode)
  }
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'cookies' &&
    isImportedBinding(callee.object, headerNamespaces, sourceCode)
  )
}

function isImportedBinding(
  identifier: ESTree.Identifier,
  bindings: ReadonlySet<ESTree.Identifier>,
  sourceCode: SourceCode
): boolean {
  const variable = findVariable(sourceCode.getScope(identifier), identifier)
  return variable?.identifiers.some((binding) => bindings.has(binding)) ?? false
}
