import type { JSXElement, JSXAttribute } from 'estree-jsx'
import { defineRule } from '../utils/define-rule'

const url = 'https://nextjs.org/docs/messages/date-hydration'

export = defineRule({
  meta: {
    docs: {
      description: 'Render `Date` without hydration mismatch',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create(context) {
    return {
      /** @param {import("estree-jsx").JSXExpressionContainer} node */
      JSXExpressionContainer(node) {
        if (node.expression.type !== 'CallExpression') return
        if (node.expression.callee.type !== 'MemberExpression') return
        if (node.expression.callee.object.type !== 'NewExpression') return
        if (node.expression.callee.object.callee.type !== 'Identifier') return
        if (node.expression.callee.object.callee.name !== 'Date') return
        const parent = context
          .getAncestors()
          .reverse()[0] as unknown as JSXElement
        const suppressed = parent.openingElement.attributes.some(
          (a) => (a as JSXAttribute).name.name === 'suppressHydrationWarning'
        )
        if (suppressed) return

        context.report({
          node,
          suggest: [
            { desc: `<Date> is not a valid React element. See: ${url}` },
          ],
          message: `Rendering \`Date\` directly can cause a hydration mismatch. See ${url}`,
        })
      },
    }
  },
})
