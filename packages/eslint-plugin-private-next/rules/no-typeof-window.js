// A lint rule that disallows the use of typeof window !== 'undefined' in Next.js code with a suggestion to use process.env.browser instead.

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow typeof window !== "undefined"',
      category: 'Possible Errors',
      recommended: true,
      url: 'https://nextjs.org/docs/messages/no-typeof-window',
    },
    fixable: 'code',
    messages: {
      noTypeofWindow: `For proper dead code elimination, do not use \`typeof window\`to check if the code is running in the browser. Use \`process.env.browser\` instead.`,
    },
  },
  create(context) {
    return {
      BinaryExpression(node) {
        if (
          node.operator !== '!==' &&
          node.operator !== '===' &&
          node.operator !== '!=' &&
          node.operator !== '=='
        ) {
          return
        }

        if (
          (node.left?.type !== 'UnaryExpression' ||
            node.left?.operator !== 'typeof') &&
          (node.right?.type !== 'UnaryExpression' ||
            node.right?.operator !== 'typeof')
        ) {
          return
        }

        if (
          (node.right?.type !== 'Literal' ||
            node.right?.value !== 'undefined') &&
          (node.left?.type !== 'Literal' || node.left?.value !== 'undefined')
        ) {
          return
        }

        if (
          (node.left.argument?.type !== 'Identifier' ||
            node.left.argument?.name !== 'window') &&
          (node.right.argument?.type !== 'Identifier' ||
            node.right.argument?.name !== 'window')
        ) {
          return
        }

        const isNegated = node.operator === '!==' || node.operator === '!='

        context.report({
          node,
          messageId: 'noTypeofWindow',
          fix(fixer) {
            return fixer.replaceText(
              node,
              `${isNegated ? '' : '!'}process.env.browser`
            )
          },
        })
      },
    }
  },
}
