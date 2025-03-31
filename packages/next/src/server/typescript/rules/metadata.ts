import { NEXT_TS_ERRORS } from '../constant'
import { getSource, getTs, getTypeChecker } from '../utils'

import type tsModule from 'typescript/lib/tsserverlibrary'

function hasCorrectType(
  node: tsModule.FunctionDeclaration | tsModule.VariableDeclaration,
  isAsync: boolean = false
): boolean {
  const ts = getTs()

  if (!node.type) return false
  const typeText = node.type.getText()

  if (ts.isFunctionDeclaration(node)) {
    return typeText === (isAsync ? 'Promise<Metadata>' : 'Metadata')
  } else {
    return typeText === 'Metadata'
  }
}

const metadata = {
  getSemanticDiagnosticsForExportVariableStatement(
    fileName: string,
    node: tsModule.VariableStatement | tsModule.FunctionDeclaration,
    isClientEntry: boolean
  ) {
    const file = getSource(fileName)
    const ts = getTs()

    if (ts.isFunctionDeclaration(node)) {
      if (node.name?.getText() === 'generateMetadata') {
        if (isClientEntry) {
          return [
            {
              file,
              category: ts.DiagnosticCategory.Error,
              code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
              messageText: `The Next.js "generateMetadata" API is not allowed in a client component.`,
              start: node.name.getStart(),
              length: node.name.getWidth(),
            },
          ]
        } else {
          const isAsync = node.modifiers?.some(
            (m) => m.kind === ts.SyntaxKind.AsyncKeyword
          )
          return [
            {
              file,
              category: ts.DiagnosticCategory.Warning,
              code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
              messageText: `The "generateMetadata" export should be type of ${isAsync ? '"Promise<Metadata>"' : '"Metadata"'} from "next".`,
              start: node.name.getStart(),
              length: node.name.getWidth(),
            },
          ]
        }
      }
    } else {
      for (const declaration of node.declarationList.declarations) {
        const name = declaration.name.getText()
        if (isClientEntry) {
          if (name === 'metadata' || name === 'generateMetadata') {
            return [
              {
                file,
                category: ts.DiagnosticCategory.Error,
                code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
                messageText: `The Next.js "${name}" API is not allowed in a client component.`,
                start: declaration.name.getStart(),
                length: declaration.name.getWidth(),
              },
            ]
          }
        } else {
          if (name === 'metadata') {
            if (!hasCorrectType(declaration)) {
              return [
                {
                  file,
                  category: ts.DiagnosticCategory.Warning,
                  code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
                  messageText: `The "metadata" export should be type of "Metadata" from "next".`,
                  start: declaration.name.getStart(),
                  length: declaration.name.getWidth(),
                },
              ]
            }
          } else if (name === 'generateMetadata') {
            // Check if it's a function expression or arrow function
            if (
              declaration.initializer &&
              (ts.isFunctionExpression(declaration.initializer) ||
                ts.isArrowFunction(declaration.initializer))
            ) {
              const isAsync = declaration.initializer.modifiers?.some(
                (m) => m.kind === ts.SyntaxKind.AsyncKeyword
              )
              const typeText = declaration.type?.getText()
              if (typeText !== 'Promise<Metadata>' && typeText !== 'Metadata') {
                return [
                  {
                    file,
                    category: ts.DiagnosticCategory.Warning,
                    code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
                    messageText: `The "generateMetadata" export should be type of ${isAsync ? '"Promise<Metadata>"' : '"Metadata"'} from "next".`,
                    start: declaration.name.getStart(),
                    length: declaration.name.getWidth(),
                  },
                ]
              }
            }
          }
        }
      }
    }
    return []
  },

  getSemanticDiagnosticsForExportDeclarationInClientEntry(
    fileName: string,
    node: tsModule.ExportDeclaration
  ) {
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
            messageText: `The Next.js '${e.name.getText()}' API is not allowed in a client component.`,
            start: e.name.getStart(),
            length: e.name.getWidth(),
          })
        }
      }
    }

    return diagnostics
  },

  getSemanticDiagnosticsForExportDeclaration(
    fileName: string,
    node: tsModule.ExportDeclaration
  ) {
    const ts = getTs()
    const source = getSource(fileName)

    const exportClause = node.exportClause
    if (exportClause && ts.isNamedExports(exportClause)) {
      for (const e of exportClause.elements) {
        if (e.name.getText() === 'metadata') {
          // Get the original declaration node of element
          const typeChecker = getTypeChecker()
          if (typeChecker) {
            const symbol = typeChecker.getSymbolAtLocation(e.name)
            if (symbol) {
              const metadataSymbol = typeChecker.getAliasedSymbol(symbol)
              if (metadataSymbol && metadataSymbol.declarations) {
                const declaration = metadataSymbol.declarations[0]
                if (declaration && ts.isVariableDeclaration(declaration)) {
                  if (declaration.type) {
                    const typeText = declaration.type.getText()
                    if (!typeText.includes('Metadata')) {
                      return [
                        {
                          file: source,
                          category: ts.DiagnosticCategory.Error,
                          code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
                          messageText: `The 'metadata' export value is not typed correctly, please make sure it is typed as 'Metadata':\nhttps://nextjs.org/docs/app/building-your-application/optimizing/metadata#static-metadata`,
                          start: e.name.getStart(),
                          length: e.name.getWidth(),
                        },
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return []
  },
}

export default metadata
