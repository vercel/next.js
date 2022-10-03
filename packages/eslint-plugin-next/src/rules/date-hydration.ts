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
        const { type } = n.expression

        if (
          type !== 'CallExpression' ||
          n.expression.callee.type !== 'MemberExpression' ||
          n.expression.callee.object.type !== 'NewExpression' ||
          n.expression.callee.object.callee.type !== 'Identifier' ||
          n.expression.callee.object.callee.name !== 'Date'
        ) {
          return
        }

        const parent = context
          .getAncestors()
          .reverse()[0] as unknown as JSXElement

        const propertyName = (n.expression.callee.property as any)
          .name as string
        if (propertyName.match(/UTC|ISO/)) return

        const attr = new NodeAttributes(parent.openingElement)

        const suppressed =
          attr.has('suppressHydrationWarning') &&
          attr.value('suppressHydrationWarning') !== false

        if (suppressed) return

        context.report({
          node,
          message: `Rendering \`Date\` directly can cause a hydration mismatch. See ${url}`,
        })
      },
    }
  },
})
