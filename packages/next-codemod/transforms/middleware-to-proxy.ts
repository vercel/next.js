import type { API, ASTPath, Collection, FileInfo } from 'jscodeshift'
import path from 'path'
import fs from 'fs'
import { createParserFromPath } from '../lib/parser'

export default function transformer(file: FileInfo) {
  if (
    !/(^|[/\\])middleware\.|[/\\]src[/\\]middleware\./.test(file.path) &&
    // fixtures have unique basenames in test
    process.env.NODE_ENV !== 'test'
  ) {
    return file.source
  }

  const j = createParserFromPath(file.path)
  const root = j(file.source)

  if (!root.length) {
    return file.source
  }

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

  if (!hasChanges) {
    return file.source
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

  const source = root.toSource()

  // We will not modify the original file in real world,
  // so return the source here for testing.
  if (process.env.NODE_ENV === 'test') {
    return source
  }

  const { dir, ext } = path.parse(file.path)
  const newFilePath = path.join(dir, 'proxy' + ext)

  try {
    fs.writeFileSync(newFilePath, source)
    fs.unlinkSync(file.path)
  } catch (cause) {
    console.error(
      `Failed to write "${newFilePath}" and delete "${file.path}".\n${JSON.stringify({ cause })}`
    )
    return file.source
  }
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
