import { defineRule } from '../utils/define-rule'

const url = 'https://nextjs.org/docs/messages/no-async-client-component'
const description = 'Prevent client components from being async functions.'
const message = `${description} See: ${url}`

function isCapitalized(str: string): boolean {
  return /[A-Z]/.test(str?.[0])
}

export = defineRule({
  meta: {
    docs: {
      description,
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
              block.declaration?.type === 'FunctionDeclaration' &&
              block.declaration.async &&
              isCapitalized(block.declaration.id.name)
            ) {
              context.report({
                node: block,
                message,
              })
            }

            // async function MyComponent() {...}; export default MyComponent;
            if (
              block.declaration.type === 'Identifier' &&
              isCapitalized(block.declaration.name)
            ) {
              const targetName = block.declaration.name

              const functionDeclaration = node.body.find((localBlock) => {
                if (
                  localBlock.type === 'FunctionDeclaration' &&
                  localBlock.id.name === targetName
                )
                  return true

                if (
                  localBlock.type === 'VariableDeclaration' &&
                  localBlock.declarations.find(
                    (declaration) =>
                      declaration.id?.type === 'Identifier' &&
                      declaration.id.name === targetName
                  )
                )
                  return true

                return false
              })

              if (
                functionDeclaration?.type === 'FunctionDeclaration' &&
                functionDeclaration.async
              ) {
                context.report({
                  node: functionDeclaration,
                  message,
                })
              }

              if (functionDeclaration?.type === 'VariableDeclaration') {
                const varDeclarator = functionDeclaration.declarations.find(
                  (declaration) =>
                    declaration.id?.type === 'Identifier' &&
                    declaration.id.name === targetName
                )

                if (
                  varDeclarator?.init?.type === 'ArrowFunctionExpression' &&
                  varDeclarator.init.async
                ) {
                  context.report({
                    node: functionDeclaration,
                    message,
                  })
                }
              }
            }
          }
        }
      },
    }
  },
})
