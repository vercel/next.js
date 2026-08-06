/**
 * @type {import('eslint').Rule.RuleModule}
 */
const plugin = {
  name: 'no-ambiguous-jsx',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Unbundled JSX will default to React Client if it is not bundled in next-server. ' +
        "If you're creating JSX for React Server, use createElement from componentMod instead.",
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
