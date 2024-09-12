import type {
  API,
  Collection,
  ASTPath,
  ExportDefaultDeclaration,
} from 'jscodeshift'

const PAGE_PROPS = 'props'

function insertReactUseImport(root: Collection<any>, j: API['j']) {
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

function isAsyncFunctionDeclaration(path: ASTPath<ExportDefaultDeclaration>) {
  const decl = path.value.declaration
  const isAsyncFunction =
    (decl.type === 'FunctionDeclaration' ||
      decl.type === 'FunctionExpression' ||
      decl.type === 'ArrowFunctionExpression') &&
    decl.async
  return isAsyncFunction
}

export function transformDynamicProps(source: string, api: API) {
  const j = api.jscodeshift.withParser('tsx')
  const root = j(source)
  // Check if 'use' from 'react' needs to be imported
  let needsReactUseImport = false

  function processAsyncPropOfEntryFile(isClientComponent: boolean) {
    // find `params` and `searchParams` in file, and transform the access to them
    function renameAsyncPropIfExisted(path: ASTPath<ExportDefaultDeclaration>) {
      let found = false

      const decl = path.value.declaration
      if (
        decl.type !== 'FunctionDeclaration' &&
        decl.type !== 'FunctionExpression' &&
        decl.type !== 'ArrowFunctionExpression'
      ) {
        return found
      }

      const params = decl.params
      const firstParam = params[0]
      const propNames = []

      if (firstParam.type === 'ObjectPattern') {
        // change pageProps to pageProps.<propName>
        const propsIdentifier = j.identifier(PAGE_PROPS)

        firstParam.properties.forEach((prop) => {
          if (
            // prop
            'key' in prop &&
            prop.key.type === 'Identifier'
          ) {
            propNames.push(prop.key.name)
          }
        })

        params[0] = propsIdentifier
        found = true

        const paramTypeAnnotation = firstParam.typeAnnotation
        if (
          found &&
          paramTypeAnnotation &&
          paramTypeAnnotation.typeAnnotation?.type === 'TSTypeLiteral'
        ) {
          const typeLiteral = paramTypeAnnotation.typeAnnotation

          // Find the type property for `params`
          typeLiteral.members.forEach((member) => {
            if (
              member.type === 'TSPropertySignature' &&
              member.key.type === 'Identifier' &&
              propNames.includes(member.key.name)
            ) {
              // if it's already a Promise, don't wrap it again, return
              if (
                member.typeAnnotation &&
                member.typeAnnotation.typeAnnotation &&
                member.typeAnnotation.typeAnnotation.type ===
                  'TSTypeReference' &&
                member.typeAnnotation.typeAnnotation.typeName.type ===
                  'Identifier' &&
                member.typeAnnotation.typeAnnotation.typeName.name === 'Promise'
              ) {
                return
              }

              // Wrap the `params` type in Promise<>
              if (
                member.typeAnnotation &&
                member.typeAnnotation.typeAnnotation &&
                member.typeAnnotation.typeAnnotation.type === 'TSTypeLiteral'
              ) {
                member.typeAnnotation.typeAnnotation = j.tsTypeReference(
                  j.identifier('Promise'),
                  j.tsTypeParameterInstantiation([
                    member.typeAnnotation.typeAnnotation,
                  ])
                )
              }
            }
          })

          params[0].typeAnnotation = paramTypeAnnotation
        }
      }

      if (found) {
        needsReactUseImport = !isAsyncFunctionDeclaration(path)
        resolveAsyncProp(path, propNames)
      }

      return found
    }

    function getBodyOfFunctionDeclaration(
      path: ASTPath<ExportDefaultDeclaration>
    ) {
      const decl = path.value.declaration

      let functionBody
      if (
        decl.type === 'FunctionDeclaration' ||
        decl.type === 'FunctionExpression' ||
        decl.type === 'ArrowFunctionExpression'
      ) {
        if (decl.body && decl.body.type === 'BlockStatement') {
          functionBody = decl.body.body
        }
      }

      return functionBody
    }

    // Helper function to insert `const params = await asyncParams;` at the beginning of the function body
    function resolveAsyncProp(
      path: ASTPath<ExportDefaultDeclaration>,
      propNames: string[]
    ) {
      const isAsyncFunc = isAsyncFunctionDeclaration(path)
      const functionBody = getBodyOfFunctionDeclaration(path)

      const propsIdentifier = j.identifier(PAGE_PROPS)

      for (const propName of propNames) {
        const accessedPropId = j.memberExpression(
          propsIdentifier,
          j.identifier(propName)
        )

        if (isAsyncFunc) {
          // If it's async function, add await to the async props.<propName>
          const paramAssignment = j.variableDeclaration('const', [
            j.variableDeclarator(
              j.identifier(propName),
              j.awaitExpression(accessedPropId)
            ),
          ])
          if (functionBody) {
            functionBody.unshift(paramAssignment)
          }
        } else {
          const paramAssignment = j.variableDeclaration('const', [
            j.variableDeclarator(
              j.identifier(propName),
              // TODO: if it's async function, await it
              // if it's sync function, wrap it with `use` from 'react'
              j.callExpression(j.identifier('use'), [
                // j.memberExpression(propsIdentifier, j.identifier(propName)),
                accessedPropId,
              ])
            ),
          ])
          if (functionBody) {
            functionBody.unshift(paramAssignment)
          }
        }
      }

      // if (isAsyncFunc) {
      //   // If it's async function, add await to the async prop
      //   if (functionBody) {
      //     const newStatement = j.variableDeclaration('const', [
      //       j.variableDeclarator(
      //         getIdentifier(j, propName),
      //         j.awaitExpression(getIdentifier(j, asyncPropName))
      //       ),
      //     ])
      //     functionBody.unshift(newStatement)
      //   }
      // } else {
      //   // If it's sync function, wrap the async prop with `use` from 'react'
      //   if (functionBody) {
      //     const newStatement = j.variableDeclaration('const', [
      //       j.variableDeclarator(
      //         getIdentifier(j, propName),
      //         j.callExpression(j.identifier('use'), [
      //           getIdentifier(j, asyncPropName),
      //         ])
      //       ),
      //     ])
      //     functionBody.unshift(newStatement)
      //     needsReactUseImport = true
      //   }
      // }
    }

    if (!isClientComponent) {
      // Process Function Declarations
      const functionDeclarations = root.find(j.ExportDefaultDeclaration, {
        declaration: {
          type: (type) =>
            type === 'FunctionDeclaration' ||
            type === 'FunctionExpression' ||
            type === 'ArrowFunctionExpression',
        },
      })

      functionDeclarations.forEach((path) => {
        renameAsyncPropIfExisted(path)
      })
    }
  }

  const isClientComponentFile =
    root.find(j.Literal, { value: 'use client' }).size() > 0

  // Apply to `params` and `searchParams`
  processAsyncPropOfEntryFile(isClientComponentFile)
  // processAsyncPropOfEntryFile('searchParams', isClientComponentFile)

  // Add import { use } from 'react' if needed and not already imported
  if (needsReactUseImport) {
    insertReactUseImport(root, j)
  }

  return root.toSource()
}
