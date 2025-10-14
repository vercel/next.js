/**
 * ESLint rule: typechecked-require
 */

/**
 * @type {import('eslint').Rule.RuleModule}
 */
const plugin = {
  name: 'no-jsx-in-app-router',
  meta: {
    type: 'problem',
    docs: {
      description:
        'JSX in app-render will default to React Client if it is not bundled in next-server. ' +
        "If you're creating JSX for React Server, use createElement from ComponentMod instead.",
      category: 'TypeScript',
      recommended: true,
    },
    fixable: 'code',
    schema: [],
    messages: {},
  },

  create(context) {
    function reportJSX(node) {
      context.report({
        message: 'Ambiguous JSX usage.',
        node: node.openingFragment ?? node.name,
      })
    }

    return {
      JSXOpeningElement: reportJSX,
      JSXFragment: reportJSX,
    }
  },
}

module.exports = plugin
