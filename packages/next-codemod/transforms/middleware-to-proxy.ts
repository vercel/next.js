import type { FileInfo } from 'jscodeshift'
import { createParserFromPath } from '../lib/parser'
import path from 'path'
import fs from 'fs'

export default function transformer(file: FileInfo) {
  const j = createParserFromPath(file.path)
  let hasChanges = false

  // Handle file renaming first
  const fileName = path.basename(file.path)
  const fileNameWithoutExt = path.basename(file.path, path.extname(file.path))
  const isMiddlewareFile = fileNameWithoutExt === 'middleware'

  if (isMiddlewareFile) {
    const newFileName = fileName.replace(/^middleware\./, 'proxy.')
    const newFilePath = path.join(path.dirname(file.path), newFileName)

    // Rename the file
    try {
      fs.renameSync(file.path, newFilePath)
      console.log(`Renamed ${file.path} -> ${newFilePath}`)
    } catch (error) {
      console.warn(`Failed to rename ${file.path}: ${error}`)
    }
  }

  // Parse and transform the AST
  const source = j(file.source)

  // Handle export declarations in a single traversal
  source.find(j.ExportNamedDeclaration).forEach((nodePath) => {
    const declaration = nodePath.node.declaration

    // Handle: export function middleware() {} or export async function middleware() {}
    if (
      j.FunctionDeclaration.check(declaration) &&
      declaration.id?.name === 'middleware'
    ) {
      declaration.id.name = 'proxy'
      hasChanges = true
    }

    // Handle: export { middleware }
    if (nodePath.node.specifiers) {
      nodePath.node.specifiers.forEach((specifier) => {
        if (
          j.ExportSpecifier.check(specifier) &&
          j.Identifier.check(specifier.exported) &&
          specifier.exported.name === 'middleware'
        ) {
          specifier.exported.name = 'proxy'
          // Also rename the local identifier if it matches
          if (
            j.Identifier.check(specifier.local) &&
            specifier.local.name === 'middleware'
          ) {
            specifier.local.name = 'proxy'
          }
          hasChanges = true
        }
      })
    }
  })

  // Handle function declarations that are later exported
  // Find: function middleware() {} followed by export { middleware }
  // But exclude default exports
  source
    .find(j.FunctionDeclaration, {
      id: { name: 'middleware' },
    })
    .forEach((nodePath) => {
      // Skip if this function is part of a default export
      if (nodePath.parent?.node?.type === 'ExportDefaultDeclaration') {
        return
      }

      if (nodePath.node.id) {
        nodePath.node.id.name = 'proxy'
        hasChanges = true
      }
    })

  // Handle variable declarations: const middleware = ...
  // But exclude those that are part of default exports
  source
    .find(j.VariableDeclarator, {
      id: { name: 'middleware' },
    })
    .forEach((nodePath) => {
      // Skip if this variable is part of a default export
      if (nodePath.parent?.parent?.node?.type === 'ExportDefaultDeclaration') {
        return
      }

      if (j.Identifier.check(nodePath.node.id)) {
        nodePath.node.id.name = 'proxy'
        hasChanges = true
      }
    })

  // Skip default exports - they don't need to be renamed
  // export default function middleware() {} works as-is with proxy files

  if (hasChanges) {
    return source.toSource()
  }

  return file.source
}
