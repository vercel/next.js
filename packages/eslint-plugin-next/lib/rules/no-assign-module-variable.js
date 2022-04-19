module.exports = {
  meta: {
    docs: {
      description: `Prohibit assignment to the 'module' variable`,
      recommended: true,
      url: 'https://nextjs.org/docs/messages/no-assign-module-variable',
    },
  },

  create: function (context) {
    return {
      VariableDeclaration(node) {
        // Checks node.declarations array for variable with id.name of 'module'
        const moduleVariableFound = node.declarations.some(
          (declaration) => declaration.id.name === 'module'
        )

        // Return early if no 'module' variable is found
        if (!moduleVariableFound) {
          return
        }

        context.report({
          node,
          message: `Do not assign to the variable 'module'. See: https://nextjs.org/docs/messages/no-assign-module-variable`,
        })
      },
    }
  },
}
