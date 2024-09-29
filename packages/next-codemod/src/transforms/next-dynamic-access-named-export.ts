import type { FileInfo, API, ImportDeclaration } from 'jscodeshift'

export default function transformer(file: FileInfo, api: API) {
  const j = api.jscodeshift
  const root = j(file.source)

  // Find the import declaration for 'next/dynamic'
  const dynamicImportDeclaration = root.find(j.ImportDeclaration, {
    source: { value: 'next/dynamic' },
  })

  // If the import declaration is found
  if (dynamicImportDeclaration.size() > 0) {
    const importDecl: ImportDeclaration = dynamicImportDeclaration.get(0).node
    const dynamicImportName = importDecl.specifiers?.[0]?.local?.name

    if (!dynamicImportName) {
      return root.toSource()
    }
    // Find call expressions where the callee is the imported 'dynamic'
    root
      .find(j.CallExpression, {
        callee: { name: dynamicImportName },
      })
      .forEach((path) => {
        const arrowFunction = path.node.arguments[0]

        // Ensure the argument is an ArrowFunctionExpression
        if (arrowFunction && arrowFunction.type === 'ArrowFunctionExpression') {
          const importCall = arrowFunction.body

          // Ensure the parent of the import call is a CallExpression with a .then
          if (
            importCall &&
            importCall.type === 'CallExpression' &&
            importCall.callee.type === 'MemberExpression' &&
            'name' in importCall.callee.property &&
            importCall.callee.property.name === 'then'
          ) {
            const thenFunction = importCall.arguments[0]
            // handle case of block statement case `=> { return mod.Component }`
            // transform to`=> { return { default: mod.Component } }`
            if (
              thenFunction &&
              thenFunction.type === 'ArrowFunctionExpression' &&
              thenFunction.body.type === 'BlockStatement'
            ) {
              const returnStatement = thenFunction.body.body[0]
              // Ensure the body of the arrow function has a return statement with a MemberExpression
              if (
                returnStatement &&
                returnStatement.type === 'ReturnStatement' &&
                returnStatement.argument?.type === 'MemberExpression'
              ) {
                returnStatement.argument = j.objectExpression([
                  j.property(
                    'init',
                    j.identifier('default'),
                    returnStatement.argument
                  ),
                ])
              }
            }
            // handle case `=> mod.Component`
            // transform to`=> ({ default: mod.Component })`
            if (
              thenFunction &&
              thenFunction.type === 'ArrowFunctionExpression' &&
              thenFunction.body.type === 'MemberExpression'
            ) {
              thenFunction.body = j.objectExpression([
                j.property('init', j.identifier('default'), thenFunction.body),
              ])
            }
          }
        }
      })
  }

  return root.toSource()
}
