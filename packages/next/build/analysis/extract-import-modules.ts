import type {
  Argument,
  CallExpression,
  Expression,
  ImportDeclaration,
  Module,
} from '@swc/core'
import { Visitor } from 'next/dist/compiled/@swc/core/Visitor'
import { extractValue, isIdentifier } from './shared'

const extractModuleFromImportOrRequireExpression = (a: Argument[]) => {
  const firstArgument = a[0]

  if (firstArgument) {
    try {
      const value = extractValue(firstArgument.expression)
      if (typeof value === 'string') {
        return value
      }
      // ignore non-string value
    } catch {
      // ignore UnsupportedValueError
    }
  }

  return null
}

export function extractImportModules(
  module: Module,
  excludeTypeOnlyImport = true
): string[] {
  const importSources: string[] = []

  class ImportFinder extends Visitor {
    visitImportDeclaration(n: ImportDeclaration): ImportDeclaration {
      if (excludeTypeOnlyImport) {
        if (!n.typeOnly) {
          importSources.push(n.source.value)
        }
      } else {
        importSources.push(n.source.value)
      }

      return super.visitImportDeclaration(n)
    }

    visitCallExpression(n: CallExpression): Expression {
      if (n.callee.type === 'Import') {
        // import callee
        const moduleIdentifier = extractModuleFromImportOrRequireExpression(
          n.arguments
        )
        if (moduleIdentifier) importSources.push(moduleIdentifier)
      } else if (isIdentifier(n.callee)) {
        if (n.callee.value === 'require') {
          // require()
          const moduleIdentifier = extractModuleFromImportOrRequireExpression(
            n.arguments
          )
          if (moduleIdentifier) importSources.push(moduleIdentifier)
        }
      }

      return super.visitCallExpression(n)
    }
  }

  const visitor = new ImportFinder()
  visitor.visitModule(module)

  return importSources
}
