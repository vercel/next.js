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
          if (hasCorrectType(node)) {
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
              messageText: `The "generateMetadata" export should have a return type of ${isAsync ? '"Promise<Metadata>"' : '"Metadata"'} from "next".`,
              start: node.name.getStart(),
              length: node.name.getWidth(),
            },
          ]
        }
      } else {
        for (const declaration of node.declarationList.declarations) {
          if (hasCorrectType(declaration)) {
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
                  messageText: `The "generateMetadata" export should have a return type of ${isAsync ? '"Promise<Metadata>"' : '"Metadata"'} from "next".`,
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
          if (exportName !== 'generateMetadata' && exportName !== 'metadata') {
            continue
          }

          // Get the symbol and type for the export
          const symbol = typeChecker.getSymbolAtLocation(e.name)
          if (!symbol) continue

          const type = typeChecker.getTypeOfSymbolAtLocation(symbol, e.name)
          if (!type) continue

          if (exportName === 'generateMetadata') {
            let isAsync = false

            // For export declarations, we need to get the actual declaration through the type checker
            const originalSymbol = typeChecker.getAliasedSymbol(symbol)
            const declaration = originalSymbol?.declarations?.[0]

            if (declaration) {
              if (ts.isFunctionDeclaration(declaration)) {
                isAsync =
                  declaration.modifiers?.some(
                    (m) => m.kind === ts.SyntaxKind.AsyncKeyword
                  ) ?? false
              } else if (
                ts.isVariableDeclaration(declaration) &&
                declaration.initializer
              ) {
                if (
                  ts.isArrowFunction(declaration.initializer) ||
                  ts.isFunctionExpression(declaration.initializer)
                ) {
                  isAsync =
                    declaration.initializer.modifiers?.some(
                      (m) => m.kind === ts.SyntaxKind.AsyncKeyword
                    ) ?? false
                }
              }
            }

            if (
              declaration &&
              ts.isFunctionDeclaration(declaration) &&
              !hasCorrectType(declaration)
            ) {
              diagnostics.push({
                file: source,
                category: ts.DiagnosticCategory.Warning,
                code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
                messageText: `The "generateMetadata" export should have a return type of ${isAsync ? '"Promise<Metadata>"' : '"Metadata"'} from "next".`,
                start: e.name.getStart(),
                length: e.name.getWidth(),
              })
            }
          } else {
            // must be 'metadata' at this point
            const declaration = symbol.declarations?.[0]
            if (
              declaration &&
              ts.isVariableDeclaration(declaration) &&
              !hasCorrectType(declaration)
            ) {
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
      }

      return diagnostics
    },
  },
}

function hasCorrectType(
  node: tsModule.FunctionDeclaration | tsModule.VariableDeclaration
): boolean {
  // Skip if already has type.
  if (node.type) {
    return true
  }

  const ts = getTs()
  const typeChecker = getTypeChecker()
  if (!typeChecker) {
    return false
  }

  // For generateMetadata, check if it's Promise<Metadata> for async or Metadata for sync
  if (ts.isFunctionDeclaration(node)) {
    return checkFunctionReturnType(node, typeChecker)
  } else {
    // For variable declarations (const/let/var)
    const name = node.name.getText()

    if (name === 'generateMetadata') {
      // For generateMetadata as a variable, it must be a function expression or arrow function
      if (
        !node.initializer ||
        (!ts.isFunctionExpression(node.initializer) &&
          !ts.isArrowFunction(node.initializer))
      ) {
        return false
      }

      // Check the return type of the function expression/arrow function
      if (node.initializer.type) {
        // If it has an explicit return type annotation
        return checkFunctionReturnType(node.initializer, typeChecker)
      } else {
        // If no explicit return type, infer it from the function
        const signature = typeChecker.getSignatureFromDeclaration(
          node.initializer
        )
        if (!signature) return false

        const returnType = typeChecker.getReturnTypeOfSignature(signature)
        if (!returnType) return false

        const isAsync =
          node.initializer.modifiers?.some(
            (m) => m.kind === ts.SyntaxKind.AsyncKeyword
          ) ?? false

        if (isAsync) {
          // For async functions, check if it's Promise<Metadata>
          const typeSymbol = returnType.getSymbol()
          if (!typeSymbol || typeSymbol.getName() !== 'Promise') return false

          // Check if it's a reference type (like Promise<T>)
          if (
            !(returnType.flags & ts.TypeFlags.Object) ||
            !('typeArguments' in returnType)
          ) {
            return false
          }

          const typeArgs = (
            returnType as { typeArguments: readonly tsModule.Type[] }
          ).typeArguments
          if (!typeArgs || typeArgs.length !== 1) return false

          const promiseType = typeArgs[0]
          const promiseTypeSymbol = promiseType.getSymbol()
          return promiseTypeSymbol?.getName() === 'Metadata'
        } else {
          // For sync functions, check if it returns Metadata
          const returnTypeSymbol = returnType.getSymbol()
          return returnTypeSymbol?.getName() === 'Metadata'
        }
      }
    } else {
      // For metadata export, we just need Metadata type
      if (!node.type) return false
      const type = typeChecker.getTypeFromTypeNode(node.type)
      if (!type) return false
      const symbol = type.getSymbol()
      return symbol?.getName() === 'Metadata'
    }
  }
}

function checkFunctionReturnType(
  node:
    | tsModule.FunctionDeclaration
    | tsModule.FunctionExpression
    | tsModule.ArrowFunction,
  typeChecker: tsModule.TypeChecker
): boolean {
  const ts = getTs()

  if (!node.type) return false

  const returnType = typeChecker.getTypeFromTypeNode(node.type)
  if (!returnType) return false

  const isAsync =
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false

  if (isAsync) {
    // For async functions, we need Promise<Metadata>
    const typeSymbol = returnType.getSymbol()
    if (!typeSymbol || typeSymbol.getName() !== 'Promise') {
      return false
    }

    // Get the type argument of Promise<T>
    if (!ts.isTypeReferenceNode(node.type)) {
      return false
    }

    // Check if it's a reference type (like Promise<T>)
    if (
      !(returnType.flags & ts.TypeFlags.Object) ||
      !('typeArguments' in returnType)
    ) {
      return false
    }

    const typeArgs = (returnType as { typeArguments: readonly tsModule.Type[] })
      .typeArguments
    if (!typeArgs || typeArgs.length !== 1) {
      return false
    }
    const promiseType = typeArgs[0]
    const promiseTypeSymbol = promiseType.getSymbol()
    return promiseTypeSymbol?.getName() === 'Metadata'
  } else {
    // For sync functions, we need Metadata directly
    const symbol = returnType.getSymbol()
    return symbol?.getName() === 'Metadata'
  }
}

export default metadata
