function addReactImport(j, root) {
  // We create an import specifier, this is the value of an import, eg:
  // import React from 'react'
  // The specifier would be `React`
  const ReactDefaultSpecifier = j.importDefaultSpecifier(j.identifier('React'))

  // Check if this file is already importing `react`
  // so that we can attach `React` to the existing import instead of creating a new `import` node
  const originalReactImport = root.find(j.ImportDeclaration, {
    source: {
      value: 'react',
    },
  })
  if (originalReactImport.length > 0) {
    // Check if `React` is already imported. In that case we don't have to do anything
    if (originalReactImport.find(j.ImportDefaultSpecifier).length > 0) {
      return
    }

    // Attach `React` to the existing `react` import node
    originalReactImport.forEach((node) => {
      node.value.specifiers.unshift(ReactDefaultSpecifier)
    })
    return
  }

  // Create import node
  // import React from 'react'
  const ReactImport = j.importDeclaration(
    [ReactDefaultSpecifier],
    j.stringLiteral('react')
  )

  // Find the Program, this is the top level AST node
  const Program = root.find(j.Program)
  // Attach the import at the top of the body
  Program.forEach((node) => {
    node.value.body.unshift(ReactImport)
  })
}

export default function transformer(file, api, options) {
  const j = api.jscodeshift
  const root = j(file.source)

  const hasReactImport = (r) => {
    return (
      r.find(j.ImportDefaultSpecifier, {
        local: {
          type: 'Identifier',
          name: 'React',
        },
      }).length > 0
    )
  }

  const hasReactVariableUsage = (r) => {
    return (
      r.find(j.MemberExpression, {
        object: {
          type: 'Identifier',
          name: 'React',
        },
      }).length > 0
    )
  }

  if (hasReactImport(root)) {
    return
  }

  if (hasReactVariableUsage(root)) {
    addReactImport(j, root)
  }

  return root.toSource(options)
}
