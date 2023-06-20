import { defineRule } from '../utils/define-rule'

const url = 'https://nextjs.org/docs/messages/no-async-client-component'
const message = `Client components cannot be async functions. See: ${url}`

export = defineRule({
  meta: {
    docs: {
      description: 'Prevent client components from being async functions.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },

  create(context) {
    return {
      Program(node) {
        let isClientComponent: boolean = false

        for (const block of node.body) {
          if (
            block.type === 'ExpressionStatement' &&
            block.expression.type === 'Literal' &&
            block.expression.value === 'use client'
          ) {
            isClientComponent = true
          }

          if (block.type === 'ExportDefaultDeclaration' && isClientComponent) {
            // export default async function MyComponent() {...}
            if (
              block.declaration.type === 'FunctionDeclaration' &&
              block.declaration.async
            ) {
              context.report({
                node: block,
                message,
              })
            }

            // async function MyComponent() {...}; export default MyComponent;
            if (block.declaration.type === 'Identifier') {
              const functionName = block.declaration.name
              const functionDeclaration = node.body.find(
                (localBlock) =>
                  localBlock.type === 'FunctionDeclaration' &&
                  localBlock.id.name === functionName
              )

              if (
                functionDeclaration.type === 'FunctionDeclaration' &&
                functionDeclaration.async
              ) {
                context.report({
                  node: functionDeclaration,
                  message,
                })
              }
            }
          }
        }
      },
    }
  },
})
