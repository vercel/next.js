import type {
  API,
  Collection,
  ASTPath,
  ObjectPattern,
  Identifier,
} from 'jscodeshift'
import {
  determineClientDirective,
  generateUniqueIdentifier,
  getFunctionPathFromExportPath,
  insertReactUseImport,
  isFunctionType,
  TARGET_NAMED_EXPORTS,
  TARGET_PROP_NAMES,
  turnFunctionReturnTypeToAsync,
  wrapParentheseIfNeeded,
  type FunctionScope,
  insertCommentOnce,
  TARGET_ROUTE_EXPORTS,
  getVariableDeclaratorId,
} from './utils'

const PAGE_PROPS = 'props'

function findFunctionBody(path: ASTPath<FunctionScope>) {
  let functionBody = path.node.body
  if (functionBody && functionBody.type === 'BlockStatement') {
    return functionBody.body
  }
  return null
}

function awaitMemberAccessOfProp(
  propIdName: string,
  path: ASTPath<FunctionScope>,
  j: API['jscodeshift']
) {
  // search the member access of the prop
  const functionBody = findFunctionBody(path)
  const memberAccess = j(functionBody).find(j.MemberExpression, {
    object: {
      type: 'Identifier',
      name: propIdName,
    },
  })

  let hasAwaited = false
  // await each member access
  memberAccess.forEach((memberAccessPath) => {
    const member = memberAccessPath.value

    // check if it's already awaited
    if (memberAccessPath.parentPath?.value.type === 'AwaitExpression') {
      return
    }
    const awaitedExpr = j.awaitExpression(member)

    const awaitMemberAccess = wrapParentheseIfNeeded(true, j, awaitedExpr)
    memberAccessPath.replace(awaitMemberAccess)
    hasAwaited = true
  })

  // If there's any awaited member access, we need to make the function async
  if (hasAwaited) {
    if (!path.value.async) {
      if ('async' in path.value) {
        path.value.async = true
        turnFunctionReturnTypeToAsync(path.value, j)
      }
    }
  }
  return hasAwaited
}

function applyUseAndRenameAccessedProp(
  propIdName: string,
  path: ASTPath<FunctionScope>,
  j: API['jscodeshift']
) {
  // search the member access of the prop, and rename the member access to the member value
  // e.g.
  // props.params => params
  // props.params.foo => params.foo
  // props.searchParams.search => searchParams.search
  let modified = false
  const functionBody = findFunctionBody(path)
  const memberAccess = j(functionBody).find(j.MemberExpression, {
    object: {
      type: 'Identifier',
      name: propIdName,
    },
  })

  const accessedNames: string[] = []
  // rename each member access
  memberAccess.forEach((memberAccessPath) => {
    const member = memberAccessPath.value
    const memberProperty = member.property
    if (j.Identifier.check(memberProperty)) {
      accessedNames.push(memberProperty.name)
    } else if (j.MemberExpression.check(memberProperty)) {
      let currentMember = memberProperty
      if (j.Identifier.check(currentMember.object)) {
        accessedNames.push(currentMember.object.name)
      }
    }
    memberAccessPath.replace(memberProperty)
  })

  // If there's any renamed member access, need to call `use()` onto member access
  // e.g. ['params'] => insert `const params = use(props.params)`
  if (accessedNames.length > 0) {
    const accessedPropId = j.identifier(propIdName)
    const accessedProp = j.memberExpression(
      accessedPropId,
      j.identifier(accessedNames[0])
    )

    const useCall = j.callExpression(j.identifier('use'), [accessedProp])
    const useDeclaration = j.variableDeclaration('const', [
      j.variableDeclarator(j.identifier(accessedNames[0]), useCall),
    ])

    if (functionBody) {
      functionBody.unshift(useDeclaration)
    }

    modified = true
  }
  return modified
}

const MATCHED_FILE_PATTERNS = /([\\/]|^)(page|layout)\.(t|j)sx?$/

function modifyTypes(
  paramTypeAnnotation: any,
  propsIdentifier: Identifier,
  root: Collection<any>,
  j: API['jscodeshift']
) {
  if (paramTypeAnnotation && paramTypeAnnotation.typeAnnotation) {
    const typeAnnotation = paramTypeAnnotation.typeAnnotation
    if (typeAnnotation.type === 'TSTypeLiteral') {
      const typeLiteral = typeAnnotation

      // Find the type property for `params`
      typeLiteral.members.forEach((member) => {
        if (
          member.type === 'TSPropertySignature' &&
          member.key.type === 'Identifier' &&
          TARGET_PROP_NAMES.has(member.key.name)
        ) {
          // if it's already a Promise, don't wrap it again, return
          if (
            member.typeAnnotation &&
            member.typeAnnotation.typeAnnotation &&
            member.typeAnnotation.typeAnnotation.type === 'TSTypeReference' &&
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
            j.TSType.check(member.typeAnnotation.typeAnnotation)
          ) {
            member.typeAnnotation.typeAnnotation = j.tsTypeReference(
              j.identifier('Promise'),
              j.tsTypeParameterInstantiation([
                // @ts-ignore
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
        const foundTypes = findAllTypes(root, j, typeReference.typeName.name)

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
                  member.typeAnnotation?.typeAnnotation?.typeName?.name ===
                    'Promise'
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
      }
    }

    propsIdentifier.typeAnnotation = paramTypeAnnotation
  }
}

export function transformDynamicProps(
  source: string,
  api: API,
  filePath: string
) {
  const isMatched = MATCHED_FILE_PATTERNS.test(filePath)
  if (!isMatched) {
    return null
  }

  let modified = false
  let modifiedPropArgument = false
  const j = api.jscodeshift.withParser('tsx')
  const root = j(source)
  // Check if 'use' from 'react' needs to be imported
  let needsReactUseImport = false
  // Based on the prop names
  // e.g. destruct `params` { slug } = params
  // e.g. destruct `searchParams `{ search } = searchParams
  let insertedDestructPropNames = new Set<string>()

  function processAsyncPropOfEntryFile(isClientComponent: boolean) {
    // find `params` and `searchParams` in file, and transform the access to them
    function renameAsyncPropIfExisted(
      path: ASTPath<FunctionScope>,
      isDefaultExport: boolean
    ) {
      const decl = path.value
      const params = decl.params
      let functionName = decl.id?.name
      // If it's const <id> = function () {}, locate the <id> to get function name
      if (!decl.id) {
        functionName = getVariableDeclaratorId(path, j)?.name
      }
      // target properties mapping, only contains `params` and `searchParams`
      const propertiesMap = new Map<string, any>()
      let allProperties: ObjectPattern['properties'] = []
      const isRoute = !isDefaultExport && TARGET_ROUTE_EXPORTS.has(functionName)
      // generateMetadata API has 2 params
      if (functionName === 'generateMetadata') {
        if (params.length > 2 || params.length === 0) return
      } else if (isRoute) {
        if (params.length !== 2) return
      } else {
        // Page/Layout default export have 1 param
        if (params.length !== 1) return
      }
      const propsIdentifier = generateUniqueIdentifier(PAGE_PROPS, path, j)

      const propsArgumentIndex = isRoute ? 1 : 0

      const currentParam = params[propsArgumentIndex]
      if (!currentParam) return

      // Argument destructuring case
      if (currentParam.type === 'ObjectPattern') {
        // Validate if the properties are not `params` and `searchParams`,
        // if they are, quit the transformation
        let foundTargetProp = false
        for (const prop of currentParam.properties) {
          if ('key' in prop && prop.key.type === 'Identifier') {
            const propName = prop.key.name
            if (TARGET_PROP_NAMES.has(propName)) {
              foundTargetProp = true
            }
          }
        }

        // If there's no `params` or `searchParams` matched, return
        if (!foundTargetProp) return

        allProperties = currentParam.properties
        currentParam.properties.forEach((prop) => {
          if (
            // Could be `Property` or `ObjectProperty`
            'key' in prop &&
            prop.key.type === 'Identifier' &&
            TARGET_PROP_NAMES.has(prop.key.name)
          ) {
            const value = 'value' in prop ? prop.value : null
            propertiesMap.set(prop.key.name, value)
          }
        })

        modifyTypes(currentParam.typeAnnotation, propsIdentifier, root, j)

        // Override the first param to `props`
        params[propsArgumentIndex] = propsIdentifier

        modified = true
        modifiedPropArgument = true
      } else if (currentParam.type === 'Identifier') {
        // case of accessing the props.params.<name>:
        // Page(props) {}
        // generateMetadata(props, parent?) {}
        const argName = currentParam.name

        if (isClientComponent) {
          const modifiedProp = applyUseAndRenameAccessedProp(argName, path, j)
          if (modifiedProp) {
            needsReactUseImport = true
            modified = true
          }
        } else {
          modified = awaitMemberAccessOfProp(argName, path, j)
        }

        // cases of passing down `props` into any function
        // Page(props) { callback(props) }

        // search for all the argument of CallExpression, where currentParam is one of the arguments
        const callExpressions = j(path).find(j.CallExpression, {
          arguments: (args) => {
            return args.some((arg) => {
              return (
                j.Identifier.check(arg) &&
                arg.name === argName &&
                arg.type === 'Identifier'
              )
            })
          },
        })

        // Add a comment to warn users that properties of `props` need to be awaited when accessed
        callExpressions.forEach((callExpression) => {
          // find the argument `currentParam`
          const args = callExpression.value.arguments
          const propPassedAsArg = args.find(
            (arg) => j.Identifier.check(arg) && arg.name === argName
          )
          const comment = ` '${argName}' is passed as an argument. Any asynchronous properties of 'props' must be awaited when accessed. `
          insertCommentOnce(propPassedAsArg, j, comment)

          modified = true
        })

        if (modified) {
          modifyTypes(currentParam.typeAnnotation, propsIdentifier, root, j)
        }
      }

      if (modifiedPropArgument) {
        resolveAsyncProp(
          path,
          propertiesMap,
          propsIdentifier.name,
          allProperties,
          isDefaultExport
        )
      }
    }

    // Helper function to insert `const params = await asyncParams;` at the beginning of the function body
    function resolveAsyncProp(
      path: ASTPath<FunctionScope>,
      propertiesMap: Map<string, Identifier | ObjectPattern | undefined>,
      propsIdentifierName: string,
      allProperties: ObjectPattern['properties'],
      isDefaultExport: boolean
    ) {
      // Rename props to `prop` argument for the function
      const insertedRenamedPropFunctionNames = new Set<string>()
      const node = path.value

      // If it's sync default export, and it's also server component, make the function async
      if (isDefaultExport && !isClientComponent) {
        if (!node.async) {
          if ('async' in node) {
            node.async = true
            turnFunctionReturnTypeToAsync(node, j)
          }
        }
      }

      // If it's arrow function and function body is not block statement, check if the properties are used there
      if (
        j.ArrowFunctionExpression.check(path.node) &&
        !j.BlockStatement.check(path.node.body)
      ) {
        const objectExpression = path.node.body
        let hasUsedProps = false
        j(objectExpression)
          .find(j.Identifier)
          .forEach((identifierPath) => {
            const idName = identifierPath.value.name
            if (propertiesMap.has(idName)) {
              hasUsedProps = true
              return
            }
          })

        // Turn the function body to block statement, return the object expression
        if (hasUsedProps) {
          path.node.body = j.blockStatement([
            j.returnStatement(objectExpression),
          ])
        }
      }

      const isAsyncFunc = !!node.async
      const functionName = path.value.id?.name || 'default'
      const functionBody = findFunctionBody(path)
      const hasOtherProperties = allProperties.length > propertiesMap.size

      function createDestructuringDeclaration(
        properties: ObjectPattern['properties'],
        destructPropsIdentifierName: string
      ) {
        const propsToKeep = []
        let restProperty = null

        // Iterate over the destructured properties
        properties.forEach((property) => {
          if (j.ObjectProperty.check(property)) {
            // Handle normal and computed properties
            const keyName = j.Identifier.check(property.key)
              ? property.key.name
              : j.Literal.check(property.key)
                ? property.key.value
                : null // for computed properties

            if (typeof keyName === 'string') {
              propsToKeep.push(property)
            }
          } else if (j.RestElement.check(property)) {
            restProperty = property
          }
        })

        if (propsToKeep.length === 0 && !restProperty) {
          return null
        }

        if (restProperty) {
          propsToKeep.push(restProperty)
        }

        return j.variableDeclaration('const', [
          j.variableDeclarator(
            j.objectPattern(propsToKeep),
            j.identifier(destructPropsIdentifierName)
          ),
        ])
      }

      if (hasOtherProperties) {
        /**
         * If there are other properties, we need to keep the original param with destructuring
         * e.g.
         * input:
         * Page({ params: { slug }, otherProp }) {
         *   const { slug } = await props.params;
         * }
         *
         * output:
         * Page(props) {
         *   const { otherProp } = props; // inserted
         *   // ...rest of the function body
         * }
         */
        const restProperties = allProperties.filter((prop) => {
          const isTargetProps =
            'key' in prop &&
            prop.key.type === 'Identifier' &&
            TARGET_PROP_NAMES.has(prop.key.name)
          return !isTargetProps
        })
        const destructionOtherPropertiesDeclaration =
          createDestructuringDeclaration(restProperties, propsIdentifierName)
        if (functionBody && destructionOtherPropertiesDeclaration) {
          functionBody.unshift(destructionOtherPropertiesDeclaration)
        }
      }

      for (const [matchedPropName, paramsProperty] of propertiesMap) {
        if (!TARGET_PROP_NAMES.has(matchedPropName)) {
          continue
        }

        const propRenamedId = j.Identifier.check(paramsProperty)
          ? paramsProperty.name
          : null
        const propName = propRenamedId || matchedPropName

        // if propName is not used in lower scope, and it stars with unused prefix `_`,
        // also skip the transformation
        const hasDeclared = path.scope.declares(propName)
        if (!hasDeclared && propName.startsWith('_')) continue

        const propNameIdentifier = j.identifier(matchedPropName)
        const propsIdentifier = j.identifier(propsIdentifierName)
        const accessedPropId = j.memberExpression(
          propsIdentifier,
          propNameIdentifier
        )

        // Check param property value, if it's destructed, we need to destruct it as well
        // e.g.
        // input: Page({ params: { slug } })
        // output: const { slug } = await props.params; rather than const props = await props.params;
        const uid = functionName + ':' + propName

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

          if (!insertedDestructPropNames.has(uid) && functionBody) {
            functionBody.unshift(destructedObjectPattern)
            insertedDestructPropNames.add(uid)
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
          if (!insertedRenamedPropFunctionNames.has(uid) && functionBody) {
            functionBody.unshift(paramAssignment)
            insertedRenamedPropFunctionNames.add(uid)
          }
        } else {
          // const isFromExport = true
          if (!isClientComponent) {
            // If it's export function, populate the function to async
            if (
              isFunctionType(node.type) &&
              // Make TS happy
              'async' in node
            ) {
              node.async = true
              turnFunctionReturnTypeToAsync(node, j)
              // Insert `const <propName> = await props.<propName>;` at the beginning of the function body
              const paramAssignment = j.variableDeclaration('const', [
                j.variableDeclarator(
                  j.identifier(propName),
                  j.awaitExpression(accessedPropId)
                ),
              ])

              if (!insertedRenamedPropFunctionNames.has(uid) && functionBody) {
                functionBody.unshift(paramAssignment)
                insertedRenamedPropFunctionNames.add(uid)
              }
            }
          } else {
            const paramAssignment = j.variableDeclaration('const', [
              j.variableDeclarator(
                j.identifier(propName),
                j.callExpression(j.identifier('use'), [accessedPropId])
              ),
            ])
            if (!insertedRenamedPropFunctionNames.has(uid) && functionBody) {
              needsReactUseImport = true
              functionBody.unshift(paramAssignment)
              insertedRenamedPropFunctionNames.add(uid)
            }
          }
        }
      }
    }

    const defaultExportsDeclarations = root.find(j.ExportDefaultDeclaration)

    defaultExportsDeclarations.forEach((path) => {
      const functionPath = getFunctionPathFromExportPath(
        path,
        j,
        root,
        () => true
      )
      if (functionPath) {
        renameAsyncPropIfExisted(functionPath, true)
      }
    })

    // Matching Next.js functional named export of route entry:
    // - export function <named>(...) { ... }
    // - export const <named> = ...
    const namedExportDeclarations = root.find(j.ExportNamedDeclaration)

    namedExportDeclarations.forEach((path) => {
      const functionPath = getFunctionPathFromExportPath(
        path,
        j,
        root,
        (idName) => TARGET_NAMED_EXPORTS.has(idName)
      )

      if (functionPath) {
        renameAsyncPropIfExisted(functionPath, false)
      }
    })
  }

  const isClientComponent = determineClientDirective(root, j)

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
