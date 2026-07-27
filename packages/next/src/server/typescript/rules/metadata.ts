import { NEXT_TS_ERRORS } from '../constant'
import { getSource, getTs, getTypeChecker } from '../utils'

import type tsModule from 'typescript/lib/tsserverlibrary'

const metadata = {
  client: {
    getSemanticDiagnosticsForExportVariableStatement(
      fileName: string,
      node: tsModule.VariableStatement | tsModule.FunctionDeclaration
    ): tsModule.Diagnostic[] {
      const source = getSource(fileName)
      const ts = getTs()

      // It is not allowed to export `metadata` or `generateMetadata` in client entry
      if (ts.isFunctionDeclaration(node)) {
        if (node.name?.getText() === 'generateMetadata') {
          return [
            {
              file: source,
              category: ts.DiagnosticCategory.Error,
              code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
              messageText: `The Next.js 'generateMetadata' API is not allowed in a Client Component.`,
              start: node.name.getStart(),
              length: node.name.getWidth(),
            },
          ]
        }
      } else {
        for (const declaration of node.declarationList.declarations) {
          const name = declaration.name.getText()
          if (name === 'metadata') {
            return [
              {
                file: source,
                category: ts.DiagnosticCategory.Error,
                code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
                messageText: `The Next.js 'metadata' API is not allowed in a Client Component.`,
                start: declaration.name.getStart(),
                length: declaration.name.getWidth(),
              },
            ]
          }
        }
      }
      return []
    },
    getSemanticDiagnosticsForExportDeclaration(
      fileName: string,
      node: tsModule.ExportDeclaration
    ): tsModule.Diagnostic[] {
      const ts = getTs()
      const source = getSource(fileName)
      const diagnostics: tsModule.Diagnostic[] = []

      const exportClause = node.exportClause
      if (exportClause && ts.isNamedExports(exportClause)) {
        for (const e of exportClause.elements) {
          if (['generateMetadata', 'metadata'].includes(e.name.getText())) {
            diagnostics.push({
              file: source,
              category: ts.DiagnosticCategory.Error,
              code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
              messageText: `The Next.js '${e.name.getText()}' API is not allowed in a Client Component.`,
              start: e.name.getStart(),
              length: e.name.getWidth(),
            })
          }
        }
      }

      return diagnostics
    },
  },
  server: {
    getSemanticDiagnosticsForExportVariableStatement(
      fileName: string,
      node: tsModule.VariableStatement | tsModule.FunctionDeclaration
    ): tsModule.Diagnostic[] {
      const source = getSource(fileName)
      const ts = getTs()

      if (ts.isFunctionDeclaration(node)) {
        if (node.name?.getText() === 'generateMetadata') {
          if (hasType(node)) {
            return []
          }

          const isAsync = node.modifiers?.some(
            (m) => m.kind === ts.SyntaxKind.AsyncKeyword
          )

          return [
            {
              file: source,
              category: ts.DiagnosticCategory.Warning,
              code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
              messageText: `The Next.js "generateMetadata" export should have a return type of ${isAsync ? '"Promise<Metadata>"' : '"Metadata"'} from "next".`,
              start: node.name.getStart(),
              length: node.name.getWidth(),
            },
          ]
        }
      } else {
        for (const declaration of node.declarationList.declarations) {
          if (hasType(declaration)) {
            return []
          }

          const name = declaration.name.getText()
          if (name === 'metadata') {
            return [
              {
                file: source,
                category: ts.DiagnosticCategory.Warning,
                code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
                messageText: `The Next.js "metadata" export should be type of "Metadata" from "next".`,
                start: declaration.name.getStart(),
                length: declaration.name.getWidth(),
              },
            ]
          }
          if (name === 'generateMetadata') {
            // Check if it's a function expression or arrow function
            if (
              declaration.initializer &&
              (ts.isFunctionExpression(declaration.initializer) ||
                ts.isArrowFunction(declaration.initializer))
            ) {
              const isAsync = declaration.initializer.modifiers?.some(
                (m) => m.kind === ts.SyntaxKind.AsyncKeyword
              )
              return [
                {
                  file: source,
                  category: ts.DiagnosticCategory.Warning,
                  code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
                  messageText: `The Next.js "generateMetadata" export should have a return type of ${isAsync ? '"Promise<Metadata>"' : '"Metadata"'} from "next".`,
                  start: declaration.name.getStart(),
                  length: declaration.name.getWidth(),
                },
              ]
            }
          }
        }
      }
      return []
    },
    getSemanticDiagnosticsForExportDeclaration(
      fileName: string,
      node: tsModule.ExportDeclaration
    ) {
      const typeChecker = getTypeChecker()
      if (!typeChecker) {
        return []
      }

      const ts = getTs()
      const source = getSource(fileName)
      const diagnostics: tsModule.Diagnostic[] = []

      const exportClause = node.exportClause
      if (!node.isTypeOnly && exportClause && ts.isNamedExports(exportClause)) {
        for (const e of exportClause.elements) {
          if (e.isTypeOnly) {
            continue
          }
          const exportName = e.name.getText()
          if (exportName !== 'metadata' && exportName !== 'generateMetadata') {
            continue
          }

          const symbol = typeChecker.getSymbolAtLocation(e.name)
          if (!symbol) {
            continue
          }

          const originalSymbol = typeChecker.getAliasedSymbol(symbol)
          const declarations = originalSymbol.getDeclarations()
          if (!declarations) {
            continue
          }

          const declaration = declarations[0]
          if (hasType(declaration)) {
            continue
          }

          if (exportName === 'generateMetadata') {
            let isAsync = false

            // async function() {}
            if (ts.isFunctionDeclaration(declaration)) {
              isAsync =
                declaration.modifiers?.some(
                  (m) => m.kind === ts.SyntaxKind.AsyncKeyword
                ) ?? false
            }

            // foo = async function() {}
            // foo = async () => {}
            if (
              ts.isVariableDeclaration(declaration) &&
              declaration.initializer
            ) {
              const initializer = declaration.initializer
              const isFunction =
                ts.isArrowFunction(initializer) ||
                ts.isFunctionExpression(initializer)

              if (isFunction) {
                isAsync =
                  initializer.modifiers?.some(
                    (m) => m.kind === ts.SyntaxKind.AsyncKeyword
                  ) ?? false
              }
            }

            diagnostics.push({
              file: source,
              category: ts.DiagnosticCategory.Warning,
              code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
              messageText: `The Next.js "generateMetadata" export should have a return type of ${isAsync ? '"Promise<Metadata>"' : '"Metadata"'} from "next".`,
              start: e.name.getStart(),
              length: e.name.getWidth(),
            })
          } else {
            diagnostics.push({
              file: source,
              category: ts.DiagnosticCategory.Warning,
              code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
              messageText: `The Next.js "metadata" export should be type of "Metadata" from "next".`,
              start: e.name.getStart(),
              length: e.name.getWidth(),
            })
          }
        }
      }
      return diagnostics
    },
  },
}

function hasType(node: tsModule.Declaration): boolean {
  const ts = getTs()

  if (
    !ts.isVariableDeclaration(node) &&
    !ts.isFunctionDeclaration(node) &&
    !ts.isArrowFunction(node) &&
    !ts.isFunctionExpression(node)
  ) {
    return false
  }

  // For function declarations, expressions, and arrow functions, check if they have return type
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node)
  ) {
    return !!node.type
  }

  // For variable declarations
  if (!node.name) return false
  const name = node.name.getText()
  if (name === 'generateMetadata') {
    // If it's a function expression or arrow function, check if it has return type
    if (
      node.initializer &&
      (ts.isFunctionExpression(node.initializer) ||
        ts.isArrowFunction(node.initializer))
    ) {
      return !!node.initializer.type
    }
  }

  // For all other cases, check if the node has a type annotation
  return !!node.type
}

export default metadata
