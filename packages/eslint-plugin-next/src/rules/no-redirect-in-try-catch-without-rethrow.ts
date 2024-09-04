import { defineRule } from '../utils/define-rule'
import type { Node, BlockStatement, ImportDeclaration } from 'estree'

const url =
  'https://nextjs.org/docs/messages/no-redirect-in-try-catch-without-rethrow'

export = defineRule({
  meta: {
    docs: {
      description:
        'Ensure that when using `redirect` within a try-catch block, the catch block must start with a call to `unstable_rethrow` to ensures that errors are correctly propagated.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create(context) {
    let redirectName = 'redirect'
    let rethrowName = 'unstable_rethrow'

    function checkImport(node: ImportDeclaration) {
      if (node.source.value === 'next/navigation') {
        node.specifiers.forEach((specifier) => {
          if (specifier.type === 'ImportSpecifier') {
            if (specifier.imported.name === 'redirect') {
              redirectName = specifier.local.name
            } else if (specifier.imported.name === 'unstable_rethrow') {
              rethrowName = specifier.local.name
            }
          }
        })
      }
    }

    function isRethrowFirstStatement(blockStatement: BlockStatement): boolean {
      const firstStatement = blockStatement.body[0]
      return (
        firstStatement?.type === 'ExpressionStatement' &&
        firstStatement.expression.type === 'CallExpression' &&
        firstStatement.expression.callee.type === 'Identifier' &&
        firstStatement.expression.callee.name === rethrowName
      )
    }

    function containsRedirectCall(node: Node): boolean {
      switch (node.type) {
        case 'ExpressionStatement':
          return (
            node.expression.type === 'CallExpression' &&
            node.expression.callee.type === 'Identifier' &&
            node.expression.callee.name === redirectName
          )
        case 'BlockStatement':
          return node.body.some(containsRedirectCall)
        case 'IfStatement':
          return (
            containsRedirectCall(node.consequent) ||
            (node.alternate ? containsRedirectCall(node.alternate) : false)
          )
        default:
          return false
      }
    }

    return {
      ImportDeclaration: checkImport,
      TryStatement(node) {
        const tryBlock = node.block
        const catchBlock = node.handler.body

        if (
          containsRedirectCall(tryBlock) &&
          !isRethrowFirstStatement(catchBlock)
        ) {
          context.report({
            node: catchBlock,
            message: `When using \`redirect\` in a try-catch block, ensure you include \`unstable_rethrow\` at the start of the catch block to properly handle Next.js errors. See: ${url}`,
          })
        }
      },
    }
  },
})
