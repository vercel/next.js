import type {
  API,
  Collection,
  ASTPath,
  ExportDefaultDeclaration,
  JSCodeshift,
} from 'jscodeshift'

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

// Reuse identifier to avoid duplication
const idMaps = new Map<string, any>()
function getIdentifier(j: JSCodeshift, propName: string) {
  if (idMaps.has(propName)) {
    return idMaps.get(propName)
  } else {
    const id = j.identifier(propName)
    idMaps.set(propName, id)
    return id
  }
}

export function transformDynamicProps(source: string, api: API) {
  const j = api.jscodeshift.withParser('tsx')
  const root = j(source)
  // Check if 'use' from 'react' needs to be imported
  let needsReactUseImport = false

  function processAsyncPropOfEntryFile(
    propName: 'params' | 'searchParams',
    isClientComponent: boolean
  ) {
    const asyncPropName =
      'async' + propName[0].toUpperCase() + propName.slice(1)

    // find `params` and `searchParams` in file, and transform the access to them
    function renameAsyncPropIfExisted(path: ASTPath<ExportDefaultDeclaration>) {
      let found = null

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
      if (firstParam.type === 'ObjectPattern') {
        // rename the first param to asyncParams
        const properties = firstParam.properties
        const paramTypeAnnotation = firstParam.typeAnnotation
        properties.forEach((prop, index) => {
          if (
            prop.type === 'ObjectProperty' &&
            prop.key.type === 'Identifier' &&
            prop.key.name === propName &&
            prop.value.type === 'Identifier'
          ) {
            // prop.key = getIdentifier(j, propName)
            // prop.value = getIdentifier(j, asyncPropName)
            properties[index] = j.objectProperty(
              prop.key,
              getIdentifier(j, asyncPropName)
            )

            found = properties[index]
          }
        })

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
              member.key.name === propName
            ) {
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
        }
      }

      return found
    }

    // Helper function to insert `const params = await asyncParams;` at the beginning of the function body
    function resolveAsyncProp(path: ASTPath<ExportDefaultDeclaration>) {
      const isAsyncFunc = isAsyncFunctionDeclaration(path)
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

      if (isAsyncFunc) {
        // If it's async function, add await to the async prop
        if (functionBody) {
          const newStatement = j.variableDeclaration('const', [
            j.variableDeclarator(
              getIdentifier(j, propName),
              j.awaitExpression(getIdentifier(j, asyncPropName))
            ),
          ])
          functionBody.unshift(newStatement)
        }
      } else {
        // If it's sync function, wrap the async prop with `use` from 'react'
        if (functionBody) {
          const newStatement = j.variableDeclaration('const', [
            j.variableDeclarator(
              getIdentifier(j, propName),
              j.callExpression(j.identifier('use'), [
                getIdentifier(j, asyncPropName),
              ])
            ),
          ])
          functionBody.unshift(newStatement)
          needsReactUseImport = true
        }
      }
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
        const found = renameAsyncPropIfExisted(path)
        if (found) {
          resolveAsyncProp(path)
        }
      })
    }
  }

  const isClientComponentFile =
    root.find(j.Literal, { value: 'use client' }).size() > 0

  // Apply to `params` and `searchParams`
  processAsyncPropOfEntryFile('params', isClientComponentFile)
  processAsyncPropOfEntryFile('searchParams', isClientComponentFile)

  // Add import { use } from 'react' if needed and not already imported
  if (needsReactUseImport) {
    insertReactUseImport(root, j)
  }

  return root.toSource()
}
