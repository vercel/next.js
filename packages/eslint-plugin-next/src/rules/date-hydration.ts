import type { JSXElement, JSXExpressionContainer } from 'estree-jsx'
import { defineRule } from '../utils/define-rule'
import NodeAttributes from '../utils/node-attributes'

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
      JSXExpressionContainer(node) {
        const n = node as JSXExpressionContainer
        if (n.expression.type !== 'CallExpression') return
        else if (n.expression.callee.type !== 'MemberExpression') return
        else if (n.expression.callee.object.type !== 'NewExpression') return
        else if (n.expression.callee.object.callee.type !== 'Identifier') return
        else if (n.expression.callee.object.callee.name !== 'Date') return

        const parent = context
          .getAncestors()
          .reverse()[0] as unknown as JSXElement

        const attributes = new NodeAttributes(parent.openingElement)
        const suppressed = attributes.has('suppressHydrationWarning')

        if (suppressed) return

        context.report({
          node,
          message: `Rendering \`Date\` directly can cause a hydration mismatch. See ${url}`,
        })
      },
    }
  },
})
