import { defineRule } from '../utils/define-rule'
const url = 'https://nextjs.org/docs/messages/no-redirect-in-try-catch'

export = defineRule({
  meta: {
    docs: {
      description: 'Prevent usage of `redirect` in try-catch block.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create(context) {
    function checkForRedirectCall(statement) {
      if (
        statement.type === 'ExpressionStatement' &&
        statement.expression.type === 'CallExpression' &&
        statement.expression.callee.name === 'redirect'
      ) {
        context.report({
          node: statement,
          message: `Do not use \`redirect\` within a try-catch block. Move the \`redirect\` call outside of the try-catch block. See: ${url}`,
        })
      } else if (statement.type === 'BlockStatement') {
        statement.body.forEach((innerStatement) => {
          checkForRedirectCall(innerStatement)
        })
      } else if (statement.type === 'IfStatement') {
        checkForRedirectCall(statement.consequent)
        if (statement.alternate) {
          checkForRedirectCall(statement.alternate)
        }
      }
    }

    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'next/navigation') {
          return
        }
      },
      TryStatement(node) {
        const tryBlockStatements = node.block.body
        tryBlockStatements.forEach(checkForRedirectCall)
      },
    }
  },
})
