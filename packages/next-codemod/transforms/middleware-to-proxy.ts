import type { FileInfo } from 'jscodeshift'
import { createParserFromPath } from '../lib/parser'
import path from 'path'
import fs from 'fs'

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

  let hasChanges = false

  // Handle export declarations in a single traversal
  root.find(j.ExportNamedDeclaration).forEach((nodePath) => {
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
  root
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
  root
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

  if (!hasChanges) {
    return file.source
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
