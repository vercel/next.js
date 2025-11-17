import { defineRule } from '../utils/define-rule'
const url = 'https://nextjs.org/docs/messages/no-assign-module-variable'

export default defineRule({
  meta: {
    docs: {
      description: 'Prevent assignment to the `module` variable.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },

  create(context) {
    return {
      VariableDeclaration(node) {
        // Checks node.declarations array for variable with id.name of `module`
        const moduleVariableFound = node.declarations.some((declaration) => {
          if ('name' in declaration.id) {
            return declaration.id.name === 'module'
          }
          return false
        })

        // Return early if no `module` variable is found
        if (!moduleVariableFound) {
          return
        }

        context.report({
          node,
          message: `Do not assign to the variable \`module\`. See: ${url}`,
        })
      },
    }
  },
})
