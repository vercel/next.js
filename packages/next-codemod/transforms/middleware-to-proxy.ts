import type {
  API,
  ASTPath,
  Collection,
  FileInfo,
  ObjectExpression,
  ObjectProperty,
  Property,
  SpreadElement,
  SpreadProperty,
  ObjectMethod,
} from 'jscodeshift'

import fs from 'fs'
import { join, parse } from 'path'
import { isNextConfigFile } from './lib/utils'
import { createParserFromPath } from '../lib/parser'

// Middleware config properties that need to be renamed to proxy equivalents
const CONFIG_PROPERTY_MAP = {
  middlewarePrefetch: 'proxyPrefetch',
  middlewareClientMaxBodySize: 'proxyClientMaxBodySize',
  externalMiddlewareRewritesResolve: 'externalProxyRewritesResolve',
  skipMiddlewareUrlNormalize: 'skipProxyUrlNormalize',
}

// Type imports from 'next/server' that need to be transformed
const MIDDLEWARE_TYPE_IMPORT_MAP = {
  NextMiddleware: 'NextProxy',
  MiddlewareConfig: 'ProxyConfig',
}

export default function transformer(file: FileInfo) {
  const j = createParserFromPath(file.path)
  const root = j(file.source)

  if (!root.length) {
    return file.source
  }

  const isNextConfig =
    isNextConfigFile(file) ||
    (process.env.NODE_ENV === 'test' && /next-config-/.test(file.path))
  const isMiddlewareFile =
    /(^|[/\\])middleware\.|[/\\]src[/\\]middleware\./.test(file.path) ||
    (process.env.NODE_ENV === 'test' && !isNextConfig)
  const hasMiddlewareTypeImports = checkForNextServerTypeImports(root, j)

  // In test mode, process all files. Otherwise, only process relevant files
  if (process.env.NODE_ENV !== 'test') {
    if (!isMiddlewareFile && !isNextConfig && !hasMiddlewareTypeImports) {
      return file.source
    }
  }

  let hasChanges = false

  if (hasMiddlewareTypeImports) {
    const typeImportChanges = transformMiddlewareTypeImports(root, j)
    hasChanges = hasChanges || typeImportChanges
  }

  if (isMiddlewareFile) {
    const middlewareChanges = transformMiddlewareFunction(root, j)
    hasChanges = hasChanges || middlewareChanges.hasChanges

    // Remove runtime segment config
    const runtimeChanges = removeRuntimeConfig(root, j)
    hasChanges = hasChanges || runtimeChanges
  }

  if (isNextConfig) {
    const { hasConfigChanges } = transformNextConfig(root, j)
    hasChanges = hasChanges || hasConfigChanges
  }

  if (!hasChanges) {
    return file.source
  }

  const source = root.toSource()

  // Need to write proxy file and unlink the original middleware file.
  if (isMiddlewareFile) {
    return handleMiddlewareFileRename(file, source)
  }

  return source
}

function checkForNextServerTypeImports(
  root: Collection<any>,
  j: API['j']
): boolean {
  return (
    root
      .find(j.ImportDeclaration, {
        source: { value: 'next/server' },
      })
      .find(j.ImportSpecifier)
      .filter(
        (path: ASTPath<any>) =>
          MIDDLEWARE_TYPE_IMPORT_MAP[path.node.imported.name]
      ).length > 0
  )
}

function transformMiddlewareTypeImports(
  root: Collection<any>,
  j: API['j']
): boolean {
  let hasChanges = false

  // Transform type imports from 'next/server'
  root
    .find(j.ImportDeclaration, {
      source: { value: 'next/server' },
    })
    .forEach((importPath: ASTPath<any>) => {
      const specifiers = importPath.node.specifiers
      if (!specifiers) return

      specifiers.forEach((specifier: any) => {
        if (
          j.ImportSpecifier.check(specifier) &&
          specifier.imported &&
          MIDDLEWARE_TYPE_IMPORT_MAP[specifier.imported.name]
        ) {
          const oldImportName = specifier.imported.name
          const newImportName = MIDDLEWARE_TYPE_IMPORT_MAP[oldImportName]

          // Update the local name if it matches the original imported name
          if (specifier.local && specifier.local.name === oldImportName) {
            specifier.local.name = newImportName
          }

          // Transform the import name
          specifier.imported.name = newImportName

          hasChanges = true
        }
      })
    })

  // Also transform any type annotations using the old types
  Object.keys(MIDDLEWARE_TYPE_IMPORT_MAP).forEach((oldType) => {
    root
      .find(j.TSTypeReference)
      .filter((path: ASTPath<any>) => {
        return (
          path.node.typeName &&
          path.node.typeName.type === 'Identifier' &&
          path.node.typeName.name === oldType
        )
      })
      .forEach((path: ASTPath<any>) => {
        path.node.typeName.name = MIDDLEWARE_TYPE_IMPORT_MAP[oldType]
        hasChanges = true
      })
  })

  return hasChanges
}

function transformNextConfig(
  root: Collection<any>,
  j: API['j']
): { hasConfigChanges: boolean } {
  let hasConfigChanges = false

  // Collect config-related object expressions instead of processing all
  const configObjects = findNextConfigObjects(root, j)
  configObjects.forEach((objPath: ASTPath<any>) => {
    const result = processConfigObject(objPath.value)
    hasConfigChanges = hasConfigChanges || result.hasChanges
  })

  // Process function configurations that are likely to be Next.js config
  const configFunctions = findNextConfigFunctions(root, j)
  configFunctions.forEach((path: ASTPath<any>) => {
    const result = processFunctionConfig(path, j)
    hasConfigChanges = hasConfigChanges || result.hasChanges
  })

  // Process arrow function configurations that are likely to be Next.js config
  const configArrowFunctions = findNextConfigArrowFunctions(root, j)
  configArrowFunctions.forEach((path: ASTPath<any>) => {
    const result = processArrowFunctionConfig(path, j)
    hasConfigChanges = hasConfigChanges || result.hasChanges
  })

  // Process direct property assignments: config.experimental.middlewarePrefetch = value
  Object.keys(CONFIG_PROPERTY_MAP).forEach((oldProp) => {
    const newProp = CONFIG_PROPERTY_MAP[oldProp]

    // Handle experimental.* properties
    if (
      oldProp.startsWith('middleware') &&
      oldProp !== 'skipMiddlewareUrlNormalize'
    ) {
      root
        .find(j.AssignmentExpression, {
          left: {
            type: 'MemberExpression',
            object: {
              type: 'MemberExpression',
              property: { name: 'experimental' },
            },
            property: { name: oldProp },
          },
        })
        .forEach((path: ASTPath<any>) => {
          path.node.left.property.name = newProp
          hasConfigChanges = true
        })
    } else {
      // Handle top-level properties like skipMiddlewareUrlNormalize
      root
        .find(j.AssignmentExpression, {
          left: {
            type: 'MemberExpression',
            property: { name: oldProp },
          },
        })
        .forEach((path: ASTPath<any>) => {
          path.node.left.property.name = newProp
          hasConfigChanges = true
        })
    }
  })

  return { hasConfigChanges }
}

function processConfigObject(configObj: ObjectExpression): {
  hasChanges: boolean
} {
  let hasChanges = false

  // Check for experimental property
  const experimentalProp = configObj.properties.find(
    (prop) =>
      isStaticProperty(prop) &&
      prop.key &&
      prop.key.type === 'Identifier' &&
      prop.key.name === 'experimental'
  )

  if (experimentalProp && isStaticProperty(experimentalProp)) {
    const experimentalObj = experimentalProp.value
    if (experimentalObj.type === 'ObjectExpression') {
      // Transform properties in experimental object
      experimentalObj.properties.forEach((prop) => {
        if (
          isStaticProperty(prop) &&
          prop.key &&
          prop.key.type === 'Identifier' &&
          CONFIG_PROPERTY_MAP[prop.key.name] &&
          prop.key.name !== 'skipMiddlewareUrlNormalize' // This is top-level
        ) {
          prop.key.name = CONFIG_PROPERTY_MAP[prop.key.name]
          hasChanges = true
        }
      })
    }
  }

  // Transform top-level properties
  configObj.properties.forEach((prop) => {
    if (
      isStaticProperty(prop) &&
      prop.key &&
      prop.key.type === 'Identifier' &&
      prop.key.name === 'skipMiddlewareUrlNormalize'
    ) {
      prop.key.name = CONFIG_PROPERTY_MAP[prop.key.name]
      hasChanges = true
    }
  })

  // Also transform any top-level middleware properties (for spread scenarios)
  configObj.properties.forEach((prop) => {
    if (
      isStaticProperty(prop) &&
      prop.key &&
      prop.key.type === 'Identifier' &&
      CONFIG_PROPERTY_MAP[prop.key.name] &&
      prop.key.name !== 'skipMiddlewareUrlNormalize' // Already handled above
    ) {
      prop.key.name = CONFIG_PROPERTY_MAP[prop.key.name]
      hasChanges = true
    }
  })

  return { hasChanges }
}

function processFunctionConfig(
  path: ASTPath<any>,
  j: API['j']
): { hasChanges: boolean } {
  let hasChanges = false

  // Look for return statements with object expressions
  j(path)
    .find(j.ReturnStatement)
    .forEach((returnPath: ASTPath<any>) => {
      if (
        returnPath.node.argument &&
        returnPath.node.argument.type === 'ObjectExpression'
      ) {
        const result = processConfigObject(returnPath.node.argument)
        hasChanges = hasChanges || result.hasChanges
      }
    })

  return { hasChanges }
}

function processArrowFunctionConfig(
  path: ASTPath<any>,
  j: API['j']
): { hasChanges: boolean } {
  let hasChanges = false

  const body = path.node.body

  // Handle: () => ({ ... })
  if (body && body.type === 'ObjectExpression') {
    const result = processConfigObject(body)
    hasChanges = hasChanges || result.hasChanges
  }

  // Handle: () => { return { ... } }
  if (body && body.type === 'BlockStatement') {
    j(path)
      .find(j.ReturnStatement)
      .forEach((returnPath: ASTPath<any>) => {
        if (
          returnPath.node.argument &&
          returnPath.node.argument.type === 'ObjectExpression'
        ) {
          const result = processConfigObject(returnPath.node.argument)
          hasChanges = hasChanges || result.hasChanges
        }
      })
  }

  return { hasChanges }
}

function transformMiddlewareFunction(
  root: Collection<any>,
  j: API['j']
): { hasChanges: boolean } {
  const proxyIdentifier = generateUniqueIdentifier(root, j, 'proxy')
  const needsAlias = proxyIdentifier !== 'proxy'

  let hasChanges = false
  // Track if we exported something as 'proxy'
  let exportedAsProxy = false

  // Handle named export declarations
  root.find(j.ExportNamedDeclaration).forEach((nodePath) => {
    const declaration = nodePath.node.declaration

    // Handle: export function middleware() {} or export async function middleware() {}
    if (
      j.FunctionDeclaration.check(declaration) &&
      declaration.id?.name === 'middleware'
    ) {
      declaration.id.name = proxyIdentifier
      exportedAsProxy = true // Exported function declarations become proxy
      hasChanges = true
    }

    // Handle: export { middleware }
    if (nodePath.node.specifiers) {
      nodePath.node.specifiers.forEach((specifier) => {
        if (
          j.ExportSpecifier.check(specifier) &&
          j.Identifier.check(specifier.local) &&
          specifier.local.name === 'middleware'
        ) {
          // Check if this is exporting middleware as 'middleware' (which should become 'proxy')
          if (
            j.Identifier.check(specifier.exported) &&
            specifier.exported.name === 'middleware'
          ) {
            if (needsAlias) {
              // Create export alias: export { _proxy1 as proxy }
              const newSpecifier = j.exportSpecifier.from({
                local: j.identifier(proxyIdentifier),
                exported: j.identifier('proxy'),
              })
              // Replace in the specifiers array
              const specifierIndex = nodePath.node.specifiers.indexOf(specifier)
              nodePath.node.specifiers[specifierIndex] = newSpecifier
            } else {
              // Simple rename: export { proxy }
              specifier.exported = j.identifier('proxy')
              specifier.local = j.identifier('proxy')
            }
            exportedAsProxy = true
            hasChanges = true
          } else {
            // This is exporting middleware as something else (e.g., export { middleware as randomName })
            // Just update the local reference to the new identifier
            specifier.local = j.identifier(proxyIdentifier)
            hasChanges = true
          }
        }
      })
    }
  })

  // Handle default export declarations
  root.find(j.ExportDefaultDeclaration).forEach((nodePath) => {
    const declaration = nodePath.node.declaration

    // Handle: export default function middleware() {} or export default async function middleware() {}
    if (
      j.FunctionDeclaration.check(declaration) &&
      declaration.id?.name === 'middleware'
    ) {
      declaration.id.name = proxyIdentifier
      hasChanges = true
    }
  })

  // Handle function declarations that are later exported
  root
    .find(j.FunctionDeclaration, {
      id: { name: 'middleware' },
    })
    .forEach((nodePath) => {
      if (nodePath.node.id) {
        nodePath.node.id.name = proxyIdentifier
        hasChanges = true
      }
    })

  // Handle variable declarations: const middleware = ...
  root
    .find(j.VariableDeclarator, {
      id: { name: 'middleware' },
    })
    .forEach((nodePath) => {
      if (j.Identifier.check(nodePath.node.id)) {
        nodePath.node.id.name = proxyIdentifier
        hasChanges = true
      }
    })

  // Update all references to middleware in the scope
  if (hasChanges && needsAlias) {
    root
      .find(j.Identifier, { name: 'middleware' })
      .filter((astPath: ASTPath<any>) => {
        // Don't rename if it's part of an export specifier we already handled
        const parent = astPath.parent
        if (j.ExportSpecifier.check(parent.node)) {
          return false
        }

        // Don't rename if it's a function/variable declaration we already handled
        if (
          (j.FunctionDeclaration.check(parent.node) &&
            parent.node.id === astPath.node) ||
          (j.VariableDeclarator.check(parent.node) &&
            parent.node.id === astPath.node)
        ) {
          return false
        }

        return true
      })
      .forEach((astPath: ASTPath<any>) => {
        astPath.node.name = proxyIdentifier
      })
  }

  // If we used a unique identifier AND we exported `as proxy`, add an export alias
  // This handles cases where the export was part of the declaration itself:
  //   export function middleware() {} -> export function _proxy1() {} (needs alias)
  // vs cases where export was separate:
  //   export { middleware } -> export { _proxy1 as proxy } (already handled)
  if (needsAlias && hasChanges && exportedAsProxy) {
    // Check if we already created a proxy export (from export specifiers like `export { middleware }`)
    const hasExportSpecifier =
      root.find(j.ExportNamedDeclaration).filter((astPath: ASTPath<any>) => {
        return (
          astPath.node.specifiers &&
          astPath.node.specifiers.some(
            (spec) =>
              j.ExportSpecifier.check(spec) &&
              j.Identifier.check(spec.exported) &&
              spec.exported.name === 'proxy'
          )
        )
      }).length > 0

    // If no proxy export exists yet, create one to maintain the 'proxy' API
    // Example: export function _proxy1() {} + export { _proxy1 as proxy }
    if (!hasExportSpecifier) {
      const exportSpecifier = j.exportSpecifier.from({
        local: j.identifier(proxyIdentifier),
        exported: j.identifier('proxy'),
      })

      const exportDeclaration = j.exportNamedDeclaration(null, [
        exportSpecifier,
      ])

      // Add the export at the end of the file
      const program = root.find(j.Program)
      if (program.length > 0) {
        program.get('body').value.push(exportDeclaration)
      }
    }
  }

  return { hasChanges }
}

function handleMiddlewareFileRename(file: FileInfo, source: string): string {
  // We will not modify the original file in real world,
  // so return the source here for testing.
  if (process.env.NODE_ENV === 'test') {
    return source
  }

  const { dir, ext } = parse(file.path)
  const newFilePath = join(dir, 'proxy' + ext)

  try {
    fs.writeFileSync(newFilePath, source)
    fs.unlinkSync(file.path)
    // Return empty string to indicate successful file replacement.
    return ''
  } catch (cause) {
    console.error(
      `Failed to write "${newFilePath}" and delete "${file.path}".\n${JSON.stringify({ cause })}`
    )
    return file.source
  }
}

function isStaticProperty(
  prop:
    | Property
    | ObjectProperty
    | SpreadElement
    | SpreadProperty
    | ObjectMethod
): prop is Property | ObjectProperty {
  return prop.type === 'Property' || prop.type === 'ObjectProperty'
}

function generateUniqueIdentifier(
  root: Collection<any>,
  j: API['j'],
  baseName: string
): string {
  // First check if baseName itself is available
  if (!hasIdentifierInScope(root, j, baseName)) {
    return baseName
  }

  // Generate _proxy1, _proxy2, etc.
  let counter = 1
  while (true) {
    const candidate = `_${baseName}${counter}`
    if (!hasIdentifierInScope(root, j, candidate)) {
      return candidate
    }
    counter++
  }
}

function hasIdentifierInScope(
  root: Collection<any>,
  j: API['j'],
  name: string
): boolean {
  // Check for variable declarations
  const hasVariableDeclaration =
    root
      .find(j.VariableDeclarator)
      .filter(
        (astPath: ASTPath<any>) =>
          j.Identifier.check(astPath.value.id) && astPath.value.id.name === name
      ).length > 0

  // Check for function declarations
  const hasFunctionDeclaration =
    root
      .find(j.FunctionDeclaration)
      .filter(
        (astPath: ASTPath<any>) =>
          astPath.value.id && astPath.value.id.name === name
      ).length > 0

  // Check for import specifiers
  const hasImportSpecifier =
    root
      .find(j.ImportSpecifier)
      .filter(
        (astPath: ASTPath<any>) =>
          j.Identifier.check(astPath.value.local) &&
          astPath.value.local.name === name
      ).length > 0

  return hasVariableDeclaration || hasFunctionDeclaration || hasImportSpecifier
}

function findNextConfigObjects(
  root: Collection<any>,
  j: API['j']
): ASTPath<any>[] {
  const configObjects: ASTPath<any>[] = []

  // Find identifiers that are exported as default or assigned to module.exports
  const exportedNames = new Set<string>()

  // Handle: export default nextConfig or export default wrappedFunction(nextConfig)
  root.find(j.ExportDefaultDeclaration).forEach((path: ASTPath<any>) => {
    if (j.Identifier.check(path.node.declaration)) {
      exportedNames.add(path.node.declaration.name)
    } else if (j.ObjectExpression.check(path.node.declaration)) {
      // Direct object export: export default { ... }
      configObjects.push(path.get('declaration'))
    } else if (j.CallExpression.check(path.node.declaration)) {
      // Handle wrapped exports: export default wrapper(config)
      extractObjectsFromCallExpression(
        path.node.declaration,
        configObjects,
        exportedNames,
        j
      )
    }
  })

  // Handle: module.exports = nextConfig or module.exports = wrappedFunction(nextConfig)
  root
    .find(j.AssignmentExpression, {
      left: {
        type: 'MemberExpression',
        object: { name: 'module' },
        property: { name: 'exports' },
      },
    })
    .forEach((path: ASTPath<any>) => {
      if (j.Identifier.check(path.node.right)) {
        exportedNames.add(path.node.right.name)
      } else if (j.ObjectExpression.check(path.node.right)) {
        // Direct object assignment: module.exports = { ... }
        configObjects.push(path.get('right'))
      } else if (j.CallExpression.check(path.node.right)) {
        // Handle wrapped assignments: module.exports = wrapper(config)
        extractObjectsFromCallExpression(
          path.node.right,
          configObjects,
          exportedNames,
          j
        )
      }
    })

  // Find variable declarations for exported names
  exportedNames.forEach((name) => {
    root
      .find(j.VariableDeclarator, { id: { name } })
      .forEach((path: ASTPath<any>) => {
        if (j.ObjectExpression.check(path.node.init)) {
          configObjects.push(path.get('init'))
        }
      })
  })

  return configObjects
}

function findNextConfigFunctions(
  root: Collection<any>,
  j: API['j']
): ASTPath<any>[] {
  const configFunctions: ASTPath<any>[] = []
  const exportedNames = new Set<string>()

  // Handle: export default function or export default functionName
  root.find(j.ExportDefaultDeclaration).forEach((path: ASTPath<any>) => {
    if (j.FunctionDeclaration.check(path.node.declaration)) {
      // export default function configFunction() { ... }
      configFunctions.push(path.get('declaration'))
    } else if (j.Identifier.check(path.node.declaration)) {
      exportedNames.add(path.node.declaration.name)
    }
  })

  // Handle: module.exports = function
  root
    .find(j.AssignmentExpression, {
      left: {
        type: 'MemberExpression',
        object: { name: 'module' },
        property: { name: 'exports' },
      },
    })
    .forEach((path: ASTPath<any>) => {
      if (j.FunctionExpression.check(path.node.right)) {
        // module.exports = function() { ... }
        configFunctions.push(path.get('right'))
      } else if (j.Identifier.check(path.node.right)) {
        exportedNames.add(path.node.right.name)
      }
    })

  // Find function declarations for exported names
  exportedNames.forEach((name) => {
    root
      .find(j.FunctionDeclaration, { id: { name } })
      .forEach((path: ASTPath<any>) => {
        configFunctions.push(path)
      })
  })

  return configFunctions
}

function findNextConfigArrowFunctions(
  root: Collection<any>,
  j: API['j']
): ASTPath<any>[] {
  const configArrowFunctions: ASTPath<any>[] = []
  const exportedNames = new Set<string>()

  // Handle: export default arrowFunction
  root.find(j.ExportDefaultDeclaration).forEach((path: ASTPath<any>) => {
    if (j.ArrowFunctionExpression.check(path.node.declaration)) {
      // export default () => { ... }
      configArrowFunctions.push(path.get('declaration'))
    } else if (j.Identifier.check(path.node.declaration)) {
      exportedNames.add(path.node.declaration.name)
    }
  })

  // Handle: module.exports = arrowFunction
  root
    .find(j.AssignmentExpression, {
      left: {
        type: 'MemberExpression',
        object: { name: 'module' },
        property: { name: 'exports' },
      },
    })
    .forEach((path: ASTPath<any>) => {
      if (j.ArrowFunctionExpression.check(path.node.right)) {
        // module.exports = () => { ... }
        configArrowFunctions.push(path.get('right'))
      } else if (j.Identifier.check(path.node.right)) {
        exportedNames.add(path.node.right.name)
      }
    })

  // Find variable declarations with arrow functions for exported names
  exportedNames.forEach((name) => {
    root
      .find(j.VariableDeclarator, { id: { name } })
      .forEach((path: ASTPath<any>) => {
        if (j.ArrowFunctionExpression.check(path.node.init)) {
          configArrowFunctions.push(path.get('init'))
        }
      })
  })

  return configArrowFunctions
}

function extractObjectsFromCallExpression(
  callExpr: any,
  configObjects: ASTPath<any>[],
  exportedNames: Set<string>,
  j: API['j']
): void {
  // Recursively extract arguments from call expressions
  // E.g., wrapper(anotherWrapper(config)) or wrapper(config)
  if (callExpr.arguments) {
    callExpr.arguments.forEach((arg: any) => {
      if (j.Identifier.check(arg)) {
        exportedNames.add(arg.name)
      } else if (j.ObjectExpression.check(arg)) {
        // This would be unusual but handle direct object arguments
        // We don't have the path here, so we'll skip this case
        // It would be handled by the direct export case anyway
      } else if (j.CallExpression.check(arg)) {
        extractObjectsFromCallExpression(arg, configObjects, exportedNames, j)
      }
    })
  }
}

function removeRuntimeConfig(root: Collection<any>, j: API['j']): boolean {
  let hasChanges = false

  // Remove export const runtime = 'string'
  const directRuntimeExports = root.find(j.ExportNamedDeclaration, {
    declaration: {
      type: 'VariableDeclaration',
      declarations: [
        {
          id: { name: 'runtime' },
        },
      ],
    },
  })

  if (directRuntimeExports.size() > 0) {
    directRuntimeExports.remove()
    hasChanges = true
  }

  // Remove const runtime = 'string' declarations
  const runtimeVariableDeclarations = root
    .find(j.VariableDeclaration)
    .filter((path) =>
      path.node.declarations.some((decl) => {
        if (j.VariableDeclarator.check(decl) && j.Identifier.check(decl.id)) {
          return decl.id.name === 'runtime'
        }
        return false
      })
    )

  if (runtimeVariableDeclarations.size() > 0) {
    runtimeVariableDeclarations.forEach((path) => {
      const originalDeclarations = path.node.declarations
      const filteredDeclarations = originalDeclarations.filter((decl) => {
        if (j.VariableDeclarator.check(decl) && j.Identifier.check(decl.id)) {
          return decl.id.name !== 'runtime'
        }
        return true
      })

      // If we filtered out some declarations, update the node
      if (filteredDeclarations.length !== originalDeclarations.length) {
        // Remove the entire declaration only if no declarators left
        if (filteredDeclarations.length === 0) {
          j(path).remove()
        } else {
          path.node.declarations = filteredDeclarations
        }
      }
    })
    hasChanges = true
  }

  // Handle export { runtime } and export { runtime, other }
  const namedExports = root
    .find(j.ExportNamedDeclaration)
    .filter((path) => path.node.specifiers && path.node.specifiers.length > 0)

  namedExports.forEach((path) => {
    const specifiers = path.node.specifiers
    if (!specifiers) return

    const filteredSpecifiers = specifiers.filter((spec) => {
      if (j.ExportSpecifier.check(spec) && j.Identifier.check(spec.local)) {
        return spec.local.name !== 'runtime'
      }
      return true
    })

    // If we removed any specifiers
    if (filteredSpecifiers.length !== specifiers.length) {
      hasChanges = true

      // If no specifiers left, remove the entire export statement
      if (filteredSpecifiers.length === 0) {
        j(path).remove()
      } else {
        // Update the specifiers array
        path.node.specifiers = filteredSpecifiers
      }
    }
  })

  // Handle runtime property in config objects
  const configExports = root.find(j.ExportNamedDeclaration, {
    declaration: {
      type: 'VariableDeclaration',
      declarations: [
        {
          id: { name: 'config' },
        },
      ],
    },
  })

  configExports.forEach((path) => {
    const declaration = path.node.declaration
    if (j.VariableDeclaration.check(declaration)) {
      declaration.declarations.forEach((decl) => {
        if (
          j.VariableDeclarator.check(decl) &&
          j.Identifier.check(decl.id) &&
          decl.id.name === 'config' &&
          j.ObjectExpression.check(decl.init)
        ) {
          const objExpr = decl.init
          const initialLength = objExpr.properties.length

          // Filter out runtime property
          objExpr.properties = objExpr.properties.filter((prop) => {
            if (
              isStaticProperty(prop) &&
              prop.key &&
              prop.key.type === 'Identifier'
            ) {
              return prop.key.name !== 'runtime'
            }
            return true
          })

          // If we removed any properties
          if (objExpr.properties.length !== initialLength) {
            hasChanges = true

            // If no properties left, remove the entire config export
            if (objExpr.properties.length === 0) {
              j(path).remove()
            }
          }
        }
      })
    }
  })

  return hasChanges
}
