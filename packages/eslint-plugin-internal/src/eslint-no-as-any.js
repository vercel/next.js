/**
 * ESLint rule: no-as-any
 * Disallows `x as any` and `<any>x` type assertions.
 *
 * The report is placed on the `any` keyword, so an
 * `eslint-disable-next-line` comment targets the line of the cast even when
 * the asserted expression spans several lines.
 */

/**
 * @type {import('eslint').Rule.RuleModule}
 */
module.exports = {
  name: 'no-as-any',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow `as any` type assertions, which turn off type checking for the value and everything it flows into.',
      recommended: true,
    },
    schema: [],
    messages: {
      asAny:
        '`as any` turns off type checking for this value and everything it flows into. ' +
        'Fix the type, narrow the value with a runtime check, or use `satisfies`. ' +
        'If the cast is unavoidable, disable this rule for the line, ' +
        'with a comment above saying why: ' +
        '`// <reason>` followed by `// eslint-disable-next-line @next/internal/no-as-any`.',
    },
  },

  create(context) {
    function checkAssertion(node) {
      if (node.typeAnnotation.type === 'TSAnyKeyword') {
        context.report({ node: node.typeAnnotation, messageId: 'asAny' })
      }
    }

    return {
      TSAsExpression: checkAssertion,
      TSTypeAssertion: checkAssertion,
    }
  },
}
