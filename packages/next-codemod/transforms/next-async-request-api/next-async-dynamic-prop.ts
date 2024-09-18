import type {
  API,
  Collection,
  ASTPath,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
} from 'jscodeshift'

const PAGE_PROPS = 'props'

type FunctionalExportDeclaration =
  | ExportDefaultDeclaration
  | ExportNamedDeclaration

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
      // Final all type imports to 'react'

      const reactImport = root.find(j.ImportDeclaration, {
        source: {
          type: 'Literal',
          value: 'react',
        },
      })

      if (reactImport.size() > 0) {
        reactImport
          .get()
          .node.specifiers.push(j.importSpecifier(j.identifier('use')))
      } else {
        // Add new import declaration for 'react' and 'use'
        root
          .get()
          .node.program.body.unshift(
            j.importDeclaration(
              [j.importSpecifier(j.identifier('use'))],
              j.literal('react')
            )
          )
      }
    }
  }
}

function isAsyncFunctionDeclaration(
  path: ASTPath<FunctionalExportDeclaration>
) {
  const decl = path.value.declaration
  const isAsyncFunction =
    (decl.type === 'FunctionDeclaration' ||
      decl.type === 'FunctionExpression' ||
      decl.type === 'ArrowFunctionExpression') &&
    decl.async
  return isAsyncFunction
}

const TARGET_PROP_NAMES = new Set(['params', 'searchParams'])

export function transformDynamicProps(
  source: string,
  api: API,
  _filePath: string
) {
  let modified = false
  const j = api.jscodeshift.withParser('tsx')
  const root = j(source)
  // Check if 'use' from 'react' needs to be imported
  let needsReactUseImport = false

  function processAsyncPropOfEntryFile(isClientComponent: boolean) {
    // find `params` and `searchParams` in file, and transform the access to them
    function renameAsyncPropIfExisted(
      path: ASTPath<FunctionalExportDeclaration>
    ) {
      const decl = path.value.declaration
      if (
        decl.type !== 'FunctionDeclaration' &&
        decl.type !== 'FunctionExpression' &&
        decl.type !== 'ArrowFunctionExpression'
      ) {
        return
      }

      const params = decl.params
      const objectPropNames = []

      // If there's no first param, return
      if (params.length === 0) {
        return
      }

      for (let i = 0; i < params.length; i++) {
        const currentParam = params[i]

        if (currentParam.type === 'ObjectPattern') {
          // change pageProps to pageProps.<propName>
          const propsIdentifier = j.identifier(PAGE_PROPS)

          currentParam.properties.forEach((prop) => {
            if (
              // Could be `Property` or `ObjectProperty`
              'key' in prop &&
              prop.key.type === 'Identifier'
            ) {
              objectPropNames.push(prop.key.name)
            }
          })

          const paramTypeAnnotation = currentParam.typeAnnotation
          if (paramTypeAnnotation && paramTypeAnnotation.typeAnnotation) {
            const typeAnnotation = paramTypeAnnotation.typeAnnotation
            if (typeAnnotation.type === 'TSTypeLiteral') {
              const typeLiteral = typeAnnotation

              // Find the type property for `params`
              typeLiteral.members.forEach((member) => {
                if (
                  member.type === 'TSPropertySignature' &&
                  member.key.type === 'Identifier' &&
                  objectPropNames.includes(member.key.name)
                ) {
                  // if it's already a Promise, don't wrap it again, return
                  if (
                    member.typeAnnotation &&
                    member.typeAnnotation.typeAnnotation &&
                    member.typeAnnotation.typeAnnotation.type ===
                      'TSTypeReference' &&
                    member.typeAnnotation.typeAnnotation.typeName.type ===
                      'Identifier' &&
                    member.typeAnnotation.typeAnnotation.typeName.name ===
                      'Promise'
                  ) {
                    return
                  }

                  // Wrap the `params` type in Promise<>
                  if (
                    member.typeAnnotation &&
                    member.typeAnnotation.typeAnnotation &&
                    member.typeAnnotation.typeAnnotation.type ===
                      'TSTypeLiteral'
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
            } else if (typeAnnotation.type === 'TSTypeReference') {
              // If typeAnnotation is a type or interface, change the properties to Promise<type of property>
              // e.g. interface PageProps { params: { slug: string } } => interface PageProps { params: Promise<{ slug: string }> }
              const typeReference = typeAnnotation
              if (typeReference.typeName.type === 'Identifier') {
                // Find the actual type of the type reference
                const foundTypes = findAllTypes(
                  root,
                  j,
                  typeReference.typeName.name
                )

                // Deal with interfaces
                if (foundTypes.interfaces.length > 0) {
                  const interfaceDeclaration = foundTypes.interfaces[0]
                  if (
                    interfaceDeclaration.type === 'TSInterfaceDeclaration' &&
                    interfaceDeclaration.body?.type === 'TSInterfaceBody'
                  ) {
                    const typeBody = interfaceDeclaration.body.body
                    // if it's already a Promise, don't wrap it again, return
                    // traverse the typeReference's properties, if any is in propNames, wrap it in Promise<> if needed
                    typeBody.forEach((member) => {
                      if (
                        member.type === 'TSPropertySignature' &&
                        member.key.type === 'Identifier' &&
                        TARGET_PROP_NAMES.has(member.key.name)
                      ) {
                        // if it's already a Promise, don't wrap it again, return
                        if (
                          member.typeAnnotation &&
                          member.typeAnnotation.typeAnnotation &&
                          member.typeAnnotation?.typeAnnotation?.typeName
                            ?.name === 'Promise'
                        ) {
                          return
                        }

                        // Wrap the prop type in Promise<>
                        if (
                          member.typeAnnotation &&
                          member.typeAnnotation.typeAnnotation &&
                          // check if member name is in propNames
                          TARGET_PROP_NAMES.has(member.key.name)
                        ) {
                          member.typeAnnotation.typeAnnotation =
                            j.tsTypeReference(
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
              }
            }

            propsIdentifier.typeAnnotation = paramTypeAnnotation
          }

          // Override the first param to `props`
          params[i] = propsIdentifier

          modified = true
        }
      }

      if (modified) {
        needsReactUseImport = !isAsyncFunctionDeclaration(path)
        resolveAsyncProp(path, objectPropNames)
      }
    }

    function getBodyOfFunctionDeclaration(
      path: ASTPath<FunctionalExportDeclaration>
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
      path: ASTPath<FunctionalExportDeclaration>,
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
              j.callExpression(j.identifier('use'), [accessedPropId])
            ),
          ])
          if (functionBody) {
            functionBody.unshift(paramAssignment)
          }
        }
      }
    }

    if (!isClientComponent) {
      // Process Function Declarations
      // Matching: default export function XXX(...) { ... }
      const defaultExportFunctionDeclarations = root.find(
        j.ExportDefaultDeclaration,
        {
          declaration: {
            type: (type) =>
              type === 'FunctionDeclaration' ||
              type === 'FunctionExpression' ||
              type === 'ArrowFunctionExpression',
          },
        }
      )

      defaultExportFunctionDeclarations.forEach((path) => {
        renameAsyncPropIfExisted(path)
      })

      // Matching functional metadata export:
      // - export function generateMetadata(...) { ... }
      // - export const generateMetadata = ...
      const generateMetadataExportDeclarations = root.find(
        j.ExportNamedDeclaration,
        {
          declaration: {
            declarations: [
              {
                // match both variable and function declarations
                type(declaration: ExportNamedDeclaration['declaration']) {
                  return (
                    declaration.type === 'VariableDeclaration' ||
                    declaration.type === 'FunctionDeclaration'
                  )
                },
                id: {
                  type: 'Identifier',
                  name: 'generateMetadata',
                },
              },
            ],
          },
        }
      )

      generateMetadataExportDeclarations.forEach((path) => {
        renameAsyncPropIfExisted(path)
      })
    }
  }

  const isClientComponent =
    root
      .find(j.ExpressionStatement)
      .filter((path) => {
        const expr = path.node.expression
        return (
          expr.type === 'Literal' &&
          expr.value === 'use client' &&
          path.parentPath.node.type === 'Program'
        )
      })
      .size() > 0

  // Apply to `params` and `searchParams`
  processAsyncPropOfEntryFile(isClientComponent)

  // Add import { use } from 'react' if needed and not already imported
  if (needsReactUseImport) {
    insertReactUseImport(root, j)
  }

  return modified ? root.toSource() : null
}

function findAllTypes(
  root: Collection<any>,
  j: API['jscodeshift'],
  typeName: string
) {
  const types = {
    interfaces: [],
    typeAliases: [],
    imports: [],
    references: [],
  }

  // Step 1: Find all interface declarations with the specified name
  root
    .find(j.TSInterfaceDeclaration, {
      id: {
        type: 'Identifier',
        name: typeName,
      },
    })
    .forEach((path) => {
      types.interfaces.push(path.node)
    })

  // Step 2: Find all type alias declarations with the specified name
  root
    .find(j.TSTypeAliasDeclaration, {
      id: {
        type: 'Identifier',
        name: typeName,
      },
    })
    .forEach((path) => {
      types.typeAliases.push(path.node)
    })

  // Step 3: Find all imported types with the specified name
  root
    .find(j.ImportSpecifier, {
      imported: {
        type: 'Identifier',
        name: typeName,
      },
    })
    .forEach((path) => {
      types.imports.push(path.node)
    })

  // Step 4: Find all references to the specified type
  root
    .find(j.TSTypeReference, {
      typeName: {
        type: 'Identifier',
        name: typeName,
      },
    })
    .forEach((path) => {
      types.references.push(path.node)
    })

  return types
}
