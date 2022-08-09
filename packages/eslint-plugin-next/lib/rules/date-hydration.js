const url = 'https://nextjs.org/docs/messages/date-hydration'
/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    docs: {
      description: 'Render `Date` without hydration mismatch',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create: function (context) {
    return {
      /** @param {import("estree-jsx").JSXExpressionContainer} node */
      JSXExpressionContainer(node) {
        if (node.expression.type !== 'CallExpression') return
        if (node.expression.callee.type !== 'MemberExpression') return
        if (node.expression.callee.object.type !== 'NewExpression') return
        if (node.expression.callee.object.callee.type !== 'Identifier') return
        if (node.expression.callee.object.callee.name !== 'Date') return
        /** @type {import("estree-jsx").JSXElement} */
        const parent = context.getAncestors().reverse()[0]
        const suppressed = parent.openingElement.attributes.some(
          (a) => a.name.name === 'suppressHydrationWarning'
        )
        if (suppressed) return

        context.report({
          node,
          suggestion: `<Date> is not a valid React element. See: ${url}`,
          message: `Rendering \`Date\` directly can cause a hydration mismatch. See ${url}`,
        })
      },
    }
  },
}
