import type { API, FileInfo } from 'jscodeshift'

export default function transform(file: FileInfo, api: API) {
  const j = api.jscodeshift
  const root = j(file.source)

  // Check if 'use' from 'react' needs to be imported
  let needsReactUseImport = false

  function processAsyncApiCalls(functionName: 'cookies' | 'headers') {
    // Process each call to cookies() or headers()
    root
      .find(j.CallExpression, {
        callee: {
          type: 'Identifier',
          name: functionName,
        },
      })
      .forEach((path) => {
        // Check if available to apply transform
        const closestFunction = j(path).closest(j.FunctionDeclaration)
        const isAsyncFunction = closestFunction
          .nodes()
          .some((node) => node.async)

        // For cookies/headers API, only transform server and shared components
        if (isAsyncFunction) {
          // Add 'await' in front of cookies() call
          j(path).replaceWith(
            j.awaitExpression(j.callExpression(j.identifier(functionName), []))
          )
        } else {
          // Wrap cookies() with use() from 'react'
          j(path).replaceWith(
            j.callExpression(j.identifier('use'), [
              j.callExpression(j.identifier(functionName), []),
            ])
          )
          needsReactUseImport = true
        }
      })
  }

  const isClientComponent =
    root.find(j.Literal, { value: 'use client' }).size() > 0

  if (!isClientComponent) {
    processAsyncApiCalls('cookies')
    processAsyncApiCalls('headers')
  }

  // Add import { use } from 'react' if needed and not already imported
  if (needsReactUseImport) {
    const hasReactUseImport =
      root
        .find(j.ImportSpecifier, {
          imported: {
            type: 'Identifier',
            name: 'use',
          },
        })
        .size() > 0

    if (!hasReactUseImport) {
      const reactImportDeclaration = root.find(j.ImportDeclaration, {
        source: {
          type: 'Literal',
          value: 'react',
        },
      })

      if (reactImportDeclaration.size() > 0) {
        // Add 'use' to existing 'react' import declaration
        reactImportDeclaration
          .get()
          .node.specifiers.push(j.importSpecifier(j.identifier('use')))
      } else {
        // Create new import declaration for 'use' from 'react'
        const newImport = j.importDeclaration(
          [j.importSpecifier(j.identifier('use'))],
          j.literal('react')
        )

        // append after "use client" directive if there's any
        const clientDirectives = root.find(j.Literal, { value: 'use client' })
        if (clientDirectives.size() > 0) {
          const parent = clientDirectives.get().parentPath
          if (parent) {
            parent.insertAfter(newImport)
          } else {
            if (root.length > 0) {
              root.at(0).insertAfter(newImport)
            } else {
              root.get().node.program.body.unshift(newImport)
            }
          }
        } else {
          root.get().node.program.body.unshift(newImport)
        }
      }
    }
  }

  return root.toSource()
}
