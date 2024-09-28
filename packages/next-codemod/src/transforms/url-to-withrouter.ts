// One-time usage file. You can delete me after running the codemod!

function addWithRouterImport(j, root) {
  // We create an import specifier, this is the value of an import, eg:
  // import {withRouter} from 'next/router
  // The specifier would be `withRouter`
  const withRouterSpecifier = j.importSpecifier(j.identifier('withRouter'))

  // Check if this file is already import `next/router`
  // so that we can just attach `withRouter` instead of creating a new `import` node
  const originalRouterImport = root.find(j.ImportDeclaration, {
    source: {
      value: 'next/router',
    },
  })
  if (originalRouterImport.length > 0) {
    // Check if `withRouter` is already imported. In that case we don't have to do anything
    if (
      originalRouterImport.find(j.ImportSpecifier, {
        imported: { name: 'withRouter' },
      }).length > 0
    ) {
      return
    }

    // Attach `withRouter` to the existing `next/router` import node
    originalRouterImport.forEach((node) => {
      node.value.specifiers.push(withRouterSpecifier)
    })
    return
  }

  // Create import node
  // import {withRouter} from 'next/router'
  const withRouterImport = j.importDeclaration(
    [withRouterSpecifier],
    j.stringLiteral('next/router')
  )

  // Find the Program, this is the top level AST node
  const Program = root.find(j.Program)
  // Attach the import at the top of the body
  Program.forEach((node) => {
    node.value.body.unshift(withRouterImport)
  })
}

function getThisPropsUrlNodes(j, tree) {
  return tree.find(j.MemberExpression, {
    object: {
      type: 'MemberExpression',
      object: { type: 'ThisExpression' },
      property: { name: 'props' },
    },
    property: { name: 'url' },
  })
}

function getPropsUrlNodes(j, tree, name) {
  return tree.find(j.MemberExpression, {
    object: { name },
    property: { name: 'url' },
  })
}

// Wraps the provided node in a function call
// For example if `functionName` is `withRouter` it will wrap the provided node in `withRouter(NODE_CONTENT)`
function wrapNodeInFunction(j, functionName, args) {
  const mappedArgs = args.map((node) => {
    // If the node is a ClassDeclaration we have to turn it into a ClassExpression
    // since ClassDeclarations can't be wrapped in a function
    if (node.type === 'ClassDeclaration') {
      node.type = 'ClassExpression'
    }

    return node
  })
  return j.callExpression(j.identifier(functionName), mappedArgs)
}

function turnUrlIntoRouter(j, tree) {
  tree.find(j.Identifier, { name: 'url' }).replaceWith(j.identifier('router'))
}

export default function transformer(file, api) {
  // j is just a shorthand for the jscodeshift api
  const j = api.jscodeshift
  // this is the AST root on which we can call methods like `.find`
  const root = j(file.source)

  // We search for `export default`
  const defaultExports = root.find(j.ExportDefaultDeclaration)

  // We loop over the `export default` instances
  // This is just how jscodeshift works, there can only be one export default instance
  defaultExports.forEach((rule) => {
    // rule.value is an AST node
    const { value: node } = rule
    // declaration holds the AST node for what comes after `export default`
    const { declaration } = node

    function wrapDefaultExportInWithRouter() {
      if (
        j(rule).find(j.CallExpression, { callee: { name: 'withRouter' } })
          .length > 0
      ) {
        return
      }
      j(rule).replaceWith(
        j.exportDefaultDeclaration(
          wrapNodeInFunction(j, 'withRouter', [declaration])
        )
      )
    }

    // The `Identifier` type is given in this case:
    // export default Test
    // where `Test` is the identifier
    if (declaration.type === 'Identifier') {
      // the variable name
      const { name } = declaration

      // find the implementation of the variable, can be a class, function, etc
      let implementation = root.find(j.Declaration, { id: { name } })
      if (implementation.length === 0) {
        implementation = root.find(j.VariableDeclarator, { id: { name } })
      }

      implementation
        .find(j.Property, { key: { name: 'url' } })
        .forEach((propertyRule) => {
          const isThisPropsDestructure = j(propertyRule).closest(
            j.VariableDeclarator,
            {
              init: {
                object: {
                  type: 'ThisExpression',
                },
                property: { name: 'props' },
              },
            }
          )
          if (isThisPropsDestructure.length === 0) {
            return
          }
          const originalKeyValue = propertyRule.value.value.name
          propertyRule.value.key.name = 'router'
          wrapDefaultExportInWithRouter()
          addWithRouterImport(j, root)
          // If the property is reassigned to another variable we don't have to transform it
          if (originalKeyValue !== 'url') {
            return
          }

          propertyRule.value.value.name = 'router'
          j(propertyRule)
            .closest(j.BlockStatement)
            .find(j.Identifier, (identifierNode) => {
              if (identifierNode.type === 'JSXIdentifier') {
                return false
              }

              if (identifierNode.name !== 'url') {
                return false
              }

              return true
            })
            .replaceWith(j.identifier('router'))
        })

      // Find usage of `this.props.url`
      const thisPropsUrlUsage = getThisPropsUrlNodes(j, implementation)

      if (thisPropsUrlUsage.length === 0) {
        return
      }

      // rename `url` to `router`
      turnUrlIntoRouter(j, thisPropsUrlUsage)
      wrapDefaultExportInWithRouter()
      addWithRouterImport(j, root)
      return
    }

    const arrowFunctions = j(rule).find(j.ArrowFunctionExpression)
    ;(() => {
      if (arrowFunctions.length === 0) {
        return
      }

      arrowFunctions.forEach((r) => {
        // This makes sure we don't match nested functions, only the top one
        if (j(r).closest(j.Expression).length !== 0) {
          return
        }

        if (!r.value.params || !r.value.params[0]) {
          return
        }

        const name = r.value.params[0].name
        const propsUrlUsage = getPropsUrlNodes(j, j(r), name)
        if (propsUrlUsage.length === 0) {
          return
        }

        turnUrlIntoRouter(j, propsUrlUsage)
        wrapDefaultExportInWithRouter()
        addWithRouterImport(j, root)
      })
      return
    })()

    if (declaration.type === 'CallExpression') {
      j(rule)
        .find(j.CallExpression, (haystack) => {
          const firstArgument = haystack.arguments[0] || {}
          if (firstArgument.type === 'Identifier') {
            return true
          }

          return false
        })
        .forEach((callRule) => {
          const { name } = callRule.value.arguments[0]

          // find the implementation of the variable, can be a class, function, etc
          let implementation = root.find(j.Declaration, { id: { name } })
          if (implementation.length === 0) {
            implementation = root.find(j.VariableDeclarator, { id: { name } })
          }
          // Find usage of `this.props.url`
          const thisPropsUrlUsage = getThisPropsUrlNodes(j, implementation)

          implementation
            .find(j.Property, { key: { name: 'url' } })
            .forEach((propertyRule) => {
              const isThisPropsDestructure = j(propertyRule).closest(
                j.VariableDeclarator,
                {
                  init: {
                    object: {
                      type: 'ThisExpression',
                    },
                    property: { name: 'props' },
                  },
                }
              )
              if (isThisPropsDestructure.length === 0) {
                return
              }
              const originalKeyValue = propertyRule.value.value.name
              propertyRule.value.key.name = 'router'
              wrapDefaultExportInWithRouter()
              addWithRouterImport(j, root)
              // If the property is reassigned to another variable we don't have to transform it
              if (originalKeyValue !== 'url') {
                return
              }

              propertyRule.value.value.name = 'router'
              j(propertyRule)
                .closest(j.BlockStatement)
                .find(j.Identifier, (identifierNode) => {
                  if (identifierNode.type === 'JSXIdentifier') {
                    return false
                  }

                  if (identifierNode.name !== 'url') {
                    return false
                  }

                  return true
                })
                .replaceWith(j.identifier('router'))
            })

          if (thisPropsUrlUsage.length === 0) {
            return
          }

          // rename `url` to `router`
          turnUrlIntoRouter(j, thisPropsUrlUsage)
          wrapDefaultExportInWithRouter()
          addWithRouterImport(j, root)
          return
        })
    }

    j(rule)
      .find(j.Property, { key: { name: 'url' } })
      .forEach((propertyRule) => {
        const isThisPropsDestructure = j(propertyRule).closest(
          j.VariableDeclarator,
          {
            init: {
              object: {
                type: 'ThisExpression',
              },
              property: { name: 'props' },
            },
          }
        )
        if (isThisPropsDestructure.length === 0) {
          return
        }
        const originalKeyValue = propertyRule.value.value.name
        propertyRule.value.key.name = 'router'
        wrapDefaultExportInWithRouter()
        addWithRouterImport(j, root)
        // If the property is reassigned to another variable we don't have to transform it
        if (originalKeyValue !== 'url') {
          return
        }

        propertyRule.value.value.name = 'router'
        j(propertyRule)
          .closest(j.BlockStatement)
          .find(j.Identifier, (identifierNode) => {
            if (identifierNode.type === 'JSXIdentifier') {
              return false
            }

            if (identifierNode.name !== 'url') {
              return false
            }

            return true
          })
          .replaceWith(j.identifier('router'))
      })

    j(rule)
      .find(j.MethodDefinition, { key: { name: 'componentWillReceiveProps' } })
      .forEach((methodRule) => {
        const func = methodRule.value.value
        if (!func.params[0]) {
          return
        }
        const firstArgumentName = func.params[0].name
        const propsUrlUsage = getPropsUrlNodes(
          j,
          j(methodRule),
          firstArgumentName
        )
        turnUrlIntoRouter(j, propsUrlUsage)
        if (propsUrlUsage.length === 0) {
          return
        }
        wrapDefaultExportInWithRouter()
        addWithRouterImport(j, root)
      })

    j(rule)
      .find(j.MethodDefinition, { key: { name: 'componentDidUpdate' } })
      .forEach((methodRule) => {
        const func = methodRule.value.value
        if (!func.params[0]) {
          return
        }
        const firstArgumentName = func.params[0].name
        const propsUrlUsage = getPropsUrlNodes(
          j,
          j(methodRule),
          firstArgumentName
        )
        turnUrlIntoRouter(j, propsUrlUsage)
        if (propsUrlUsage.length === 0) {
          return
        }
        wrapDefaultExportInWithRouter()
        addWithRouterImport(j, root)
      })

    const thisPropsUrlUsage = getThisPropsUrlNodes(j, j(rule))
    const propsUrlUsage = getPropsUrlNodes(j, j(rule), 'props')

    // rename `url` to `router`
    turnUrlIntoRouter(j, thisPropsUrlUsage)
    turnUrlIntoRouter(j, propsUrlUsage)

    if (thisPropsUrlUsage.length === 0 && propsUrlUsage.length === 0) {
      return
    }

    wrapDefaultExportInWithRouter()
    addWithRouterImport(j, root)
    return
  })

  return root.toSource()
}
