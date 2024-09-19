import type {
  API,
  Collection,
  ASTPath,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  ObjectPattern,
} from 'jscodeshift'
import {
  determineClientDirective,
  insertReactUseImport,
  isFunctionType,
  TARGET_NAMED_EXPORTS,
  TARGET_PROP_NAMES,
  turnFunctionReturnTypeToAsync,
} from './utils'

const PAGE_PROPS = 'props'

type FunctionalExportDeclaration =
  | ExportDefaultDeclaration
  | ExportNamedDeclaration

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
  let insertedDestructorFunctionNames = new Set<string>() // { [export function name]: boolean }
  let insertedRenamedPropFunctionNames = new Set<string>() // { [export function name]: boolean }

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
      const propertiesMap = new Map<string, any>()

      // If there's no first param, return
      if (params.length !== 1) {
        return
      }

      const currentParam = params[0]

      // Argument destructuring case
      if (currentParam.type === 'ObjectPattern') {
        // change pageProps to pageProps.<propName>
        const propsIdentifier = j.identifier(PAGE_PROPS)

        // Validate if the properties are not `params` and `searchParams`,
        // if they are, quit the transformation
        for (const prop of currentParam.properties) {
          if ('key' in prop && prop.key.type === 'Identifier') {
            const propName = prop.key.name
            if (!TARGET_PROP_NAMES.has(propName)) {
              return
            }
          }
        }

        currentParam.properties.forEach((prop) => {
          if (
            // Could be `Property` or `ObjectProperty`
            'key' in prop &&
            prop.key.type === 'Identifier'
          ) {
            const value = 'value' in prop ? prop.value : null
            propertiesMap.set(prop.key.name, value)
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
                propertiesMap.has(member.key.name)
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
        params[0] = propsIdentifier

        modified = true
      }

      if (modified) {
        resolveAsyncProp(path, propertiesMap)
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
      propertiesMap: Map<string, ObjectPattern | undefined>
    ) {
      const isDefaultExport = path.value.type === 'ExportDefaultDeclaration'
      // If it's sync default export, and it's also server component, make the function async
      if (
        isDefaultExport &&
        !isClientComponent &&
        !isAsyncFunctionDeclaration(path)
      ) {
        if ('async' in path.value.declaration) {
          path.value.declaration.async = true
          turnFunctionReturnTypeToAsync(path.value.declaration, j)
        }
      }

      const isAsyncFunc = isAsyncFunctionDeclaration(path)
      // @ts-ignore quick way to check if it's a function and it has a name
      const functionName = path.value.declaration.id?.name || 'default'

      const functionBody = getBodyOfFunctionDeclaration(path)
      const propsIdentifier = j.identifier(PAGE_PROPS)

      for (const [propName, paramsProperty] of propertiesMap) {
        const propNameIdentifier = j.identifier(propName)
        const accessedPropId = j.memberExpression(
          propsIdentifier,
          propNameIdentifier
        )

        // Check param property value, if it's destructed, we need to destruct it as well
        // e.g.
        // input: Page({ params: { slug } })
        // output: const { slug } = await props.params; rather than const props = await props.params;
        if (paramsProperty?.type === 'ObjectPattern') {
          const objectPattern = paramsProperty
          const objectPatternProperties = objectPattern.properties

          // destruct the object pattern, e.g. { slug } => const { slug } = params;
          const destructedObjectPattern = j.variableDeclaration('const', [
            j.variableDeclarator(
              j.objectPattern(
                objectPatternProperties.map((prop) => {
                  if (
                    prop.type === 'Property' &&
                    prop.key.type === 'Identifier'
                  ) {
                    return j.objectProperty(
                      j.identifier(prop.key.name),
                      j.identifier(prop.key.name)
                    )
                  }
                  return prop
                })
              ),
              propNameIdentifier
            ),
          ])

          if (
            !insertedDestructorFunctionNames.has(functionName) &&
            functionBody
          ) {
            functionBody.unshift(destructedObjectPattern)
            insertedDestructorFunctionNames.add(functionName)
          }
        }

        if (isAsyncFunc) {
          // If it's async function, add await to the async props.<propName>
          const paramAssignment = j.variableDeclaration('const', [
            j.variableDeclarator(
              j.identifier(propName),
              j.awaitExpression(accessedPropId)
            ),
          ])
          if (
            !insertedRenamedPropFunctionNames.has(functionName) &&
            functionBody
          ) {
            functionBody.unshift(paramAssignment)
            insertedRenamedPropFunctionNames.add(functionName)
          }
        } else {
          const isFromExport = path.value.type === 'ExportNamedDeclaration'
          if (isFromExport) {
            // If it's export function, populate the function to async
            if (
              isFunctionType(path.value.declaration.type) &&
              // Make TS happy
              'async' in path.value.declaration
            ) {
              path.value.declaration.async = true
              turnFunctionReturnTypeToAsync(path.value.declaration, j)

              // Insert `const <propName> = await props.<propName>;` at the beginning of the function body
              const paramAssignment = j.variableDeclaration('const', [
                j.variableDeclarator(
                  j.identifier(propName),
                  j.awaitExpression(accessedPropId)
                ),
              ])
              if (
                !insertedRenamedPropFunctionNames.has(functionName) &&
                functionBody
              ) {
                functionBody.unshift(paramAssignment)
                insertedRenamedPropFunctionNames.add(functionName)
              }
            }
          } else {
            const paramAssignment = j.variableDeclaration('const', [
              j.variableDeclarator(
                j.identifier(propName),
                j.callExpression(j.identifier('use'), [accessedPropId])
              ),
            ])
            if (
              !insertedRenamedPropFunctionNames.has(functionName) &&
              functionBody
            ) {
              needsReactUseImport = true
              functionBody.unshift(paramAssignment)
              insertedRenamedPropFunctionNames.add(functionName)
            }
          }
        }
      }
    }

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

    // Matching Next.js functional named export of route entry:
    // - export function <named>(...) { ... }
    // - export const <named> = ...
    const targetNamedExportDeclarations = root.find(
      j.ExportNamedDeclaration,
      // Filter the name is in TARGET_NAMED_EXPORTS
      {
        declaration: {
          id: {
            name: (idName: string) => {
              return TARGET_NAMED_EXPORTS.has(idName)
            },
          },
        },
      }
    )

    targetNamedExportDeclarations.forEach((path) => {
      renameAsyncPropIfExisted(path)
    })
    // TDOO: handle targetNamedDeclarators
    // const targetNamedDeclarators = root.find(
    //   j.VariableDeclarator,
    //   (node) =>
    //     node.id.type === 'Identifier' &&
    //     TARGET_NAMED_EXPORTS.has(node.id.name)
    // )
  }

  const isClientComponent = determineClientDirective(root, j, source)

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
