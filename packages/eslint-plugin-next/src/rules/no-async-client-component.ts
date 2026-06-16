import { defineRule } from '../utils/define-rule'

const url = 'https://nextjs.org/docs/messages/no-async-client-component'
const description = 'Prevent Client Components from being async functions.'
const message = `${description} See: ${url}`

function isCapitalized(str: string): boolean {
  return /[A-Z]/.test(str?.[0])
}

export default defineRule({
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

        // Reports when an inline declaration is an async, capitalized
        // function/arrow, e.g. `export [default] async function MyComponent() {}`
        // or `export const MyComponent = async () => {}`.
        function checkInlineDeclaration(declaration, reportNode) {
          if (
            declaration?.type === 'FunctionDeclaration' &&
            declaration.async &&
            // `id` is null for anonymous default exports
            // (`export default async function () {}`), which we skip.
            isCapitalized(declaration.id?.name)
          ) {
            context.report({ node: reportNode, message })
            return
          }

          if (declaration?.type === 'VariableDeclaration') {
            for (const varDeclarator of declaration.declarations) {
              if (
                varDeclarator.id?.type === 'Identifier' &&
                isCapitalized(varDeclarator.id.name) &&
                varDeclarator.init?.type === 'ArrowFunctionExpression' &&
                varDeclarator.init.async
              ) {
                context.report({ node: reportNode, message })
              }
            }
          }
        }

        // Resolves an exported identifier (e.g. `export default MyComponent` or
        // `export { MyComponent }`) to its top-level declaration and reports
        // when it is an async, capitalized function/arrow.
        //
        // `localName` is the name the declaration is resolved by; `exportedName`
        // is the (possibly aliased) name it is exported as. Either being
        // capitalized marks it as a component, so aliased exports such as
        // `export { foo as MyComponent }` are not missed.
        function checkExportedIdentifier(
          localName: string,
          exportedName: string = localName
        ) {
          if (!isCapitalized(localName) && !isCapitalized(exportedName)) {
            return
          }

          const functionDeclaration = node.body.find((localBlock) => {
            if (
              localBlock.type === 'FunctionDeclaration' &&
              localBlock.id.name === localName
            )
              return true

            if (
              localBlock.type === 'VariableDeclaration' &&
              localBlock.declarations.find(
                (declaration) =>
                  declaration.id?.type === 'Identifier' &&
                  declaration.id.name === localName
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
                declaration.id.name === localName
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

        for (const block of node.body) {
          if (
            block.type === 'ExpressionStatement' &&
            block.expression.type === 'Literal' &&
            block.expression.value === 'use client'
          ) {
            isClientComponent = true
          }

          if (!isClientComponent) {
            continue
          }

          if (block.type === 'ExportDefaultDeclaration') {
            // export default async function MyComponent() {...}
            checkInlineDeclaration(block.declaration, block)

            // async function MyComponent() {...}; export default MyComponent;
            if (block.declaration.type === 'Identifier') {
              checkExportedIdentifier(block.declaration.name)
            }
          }

          if (block.type === 'ExportNamedDeclaration') {
            // export async function MyComponent() {...}
            // export const MyComponent = async () => {...}
            if (block.declaration) {
              checkInlineDeclaration(block.declaration, block)
            }

            // async function MyComponent() {...}; export { MyComponent };
            // also handles aliases, e.g. `export { foo as MyComponent }`.
            for (const specifier of block.specifiers) {
              if (specifier.local.type === 'Identifier') {
                checkExportedIdentifier(
                  specifier.local.name,
                  specifier.exported.type === 'Identifier'
                    ? specifier.exported.name
                    : undefined
                )
              }
            }
          }
        }
      },
    }
  },
})
