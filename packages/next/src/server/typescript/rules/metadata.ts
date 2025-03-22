import { NEXT_TS_ERRORS } from '../constant'
import {
  getSource,
  getSourceFromVirtualTsEnv,
  getTs,
  getTypeChecker,
  isPositionInsideNode,
  log,
  virtualTsEnv,
} from '../utils'

import type tsModule from 'typescript/lib/tsserverlibrary'

const TYPE_ANNOTATION = ': Metadata | null'
const TYPE_ANNOTATION_ASYNC = ': Promise<Metadata | null>'
const TYPE_IMPORT = `\n\nimport type { Metadata } from 'next'`

// Find the `export const metadata = ...` node.
function getMetadataExport(fileName: string, position: number) {
  const source = getSource(fileName)
  let metadataExport: tsModule.VariableDeclaration | undefined

  if (source) {
    const ts = getTs()
    ts.forEachChild(source, function visit(node) {
      if (metadataExport) return

      // Covered by this node
      if (isPositionInsideNode(position, node)) {
        // Export variable
        if (
          ts.isVariableStatement(node) &&
          node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        ) {
          if (ts.isVariableDeclarationList(node.declarationList)) {
            for (const declaration of node.declarationList.declarations) {
              if (
                isPositionInsideNode(position, declaration) &&
                declaration.name.getText() === 'metadata'
              ) {
                // `export const metadata = ...`
                metadataExport = declaration
                return
              }
            }
          }
        }
      }
    })
  }
  return metadataExport
}

function updateVirtualFileWithType(
  fileName: string,
  node: tsModule.VariableDeclaration | tsModule.FunctionDeclaration,
  isGenerateMetadata?: boolean
) {
  const source = getSource(fileName)
  if (!source) return

  // We annotate with the type in a virtual language service
  const sourceText = source.getFullText()
  let nodeEnd: number
  let annotation: string

  const ts = getTs()
  if (ts.isFunctionDeclaration(node)) {
    if (isGenerateMetadata) {
      nodeEnd = node.body!.getFullStart()
      const isAsync = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.AsyncKeyword
      )
      annotation = isAsync ? TYPE_ANNOTATION_ASYNC : TYPE_ANNOTATION
    } else {
      return
    }
  } else {
    nodeEnd = node.name.getFullStart() + node.name.getFullWidth()
    annotation = TYPE_ANNOTATION
  }

  const newSource =
    sourceText.slice(0, nodeEnd) +
    annotation +
    sourceText.slice(nodeEnd) +
    TYPE_IMPORT

  if (virtualTsEnv.sys.fileExists(fileName)) {
    log('[next] Updating file: ' + fileName)
    // FIXME: updateFile() breaks as the file doesn't exists, which is weird.
    // virtualTsEnv.updateFile(fileName, newSource)
    virtualTsEnv.deleteFile(fileName)
    virtualTsEnv.createFile(fileName, newSource)
  } else {
    log('[next] Creating file: ' + fileName)
    virtualTsEnv.createFile(fileName, newSource)
  }

  // // @ts-expect-error internal API since TS 5.5
  // getInfo().project.markAsDirty?.()

  return [nodeEnd, annotation.length]
}

function isTyped(
  node: tsModule.VariableDeclaration | tsModule.FunctionDeclaration
) {
  return node.type !== undefined
}

function proxyDiagnostics(
  fileName: string,
  pos: number[],
  n: tsModule.VariableDeclaration | tsModule.FunctionDeclaration
) {
  // Get diagnostics
  const diagnostics =
    virtualTsEnv.languageService.getSemanticDiagnostics(fileName)
  const source = getSourceFromVirtualTsEnv(fileName)

  // Filter and map the results
  const result = diagnostics
    .filter((d) => {
      if (d.start === undefined || d.length === undefined) return false
      if (d.start < n.getFullStart()) return false
      if (d.start + d.length >= n.getFullStart() + n.getFullWidth() + pos[1])
        return false
      return true
    })
    .map((d) => {
      return {
        file: source,
        category: d.category,
        code: d.code,
        messageText: d.messageText,
        start: d.start! < pos[0] ? d.start : d.start! - pos[1],
        length: d.length,
      }
    })

  return result
}

const metadata = {
  filterCompletionsAtPosition(
    fileName: string,
    position: number,
    _options: any,
    prior: tsModule.WithMetadata<tsModule.CompletionInfo>
  ) {
    const node = getMetadataExport(fileName, position)
    if (!node) return prior
    if (isTyped(node)) return prior

    const ts = getTs()

    // We annotate with the type in a virtual language service
    const pos = updateVirtualFileWithType(fileName, node)
    if (pos === undefined) return prior

    // Get completions
    const newPos = position <= pos[0] ? position : position + pos[1]
    const completions = virtualTsEnv.languageService.getCompletionsAtPosition(
      fileName,
      newPos,
      undefined
    )

    if (completions) {
      completions.isIncomplete = true

      completions.entries = completions.entries
        .filter((e) => {
          return [
            ts.ScriptElementKind.memberVariableElement,
            ts.ScriptElementKind.typeElement,
            ts.ScriptElementKind.string,
          ].includes(e.kind)
        })
        .map((e) => {
          const insertText =
            e.kind === ts.ScriptElementKind.memberVariableElement &&
            /^[a-zA-Z0-9_]+$/.test(e.name)
              ? e.name + ': '
              : e.name

          return {
            name: e.name,
            insertText,
            kind: e.kind,
            kindModifiers: e.kindModifiers,
            sortText: '!' + e.name,
            labelDetails: {
              description: `Next.js metadata`,
            },
            data: e.data,
          }
        })

      return completions
    }

    return prior
  },

  getSemanticDiagnosticsForExportVariableStatementInClientEntry(
    fileName: string,
    node: tsModule.VariableStatement | tsModule.FunctionDeclaration
  ) {
    const source = getSourceFromVirtualTsEnv(fileName)
    const ts = getTs()

    // It is not allowed to export `metadata` or `generateMetadata` in client entry
    if (ts.isFunctionDeclaration(node)) {
      if (node.name?.getText() === 'generateMetadata') {
        return [
          {
            file: source,
            category: ts.DiagnosticCategory.Error,
            code: NEXT_TS_ERRORS.INVALID_METADATA_EXPORT,
            messageText: `The Next.js 'generateMetadata' API is not allowed in a client component.`,
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
              messageText: `The Next.js 'metadata' API is not allowed in a client component.`,
              start: declaration.name.getStart(),
              length: declaration.name.getWidth(),
            },
          ]
        }
      }
    }
    return []
  },

  getSemanticDiagnosticsForExportVariableStatement(
    fileName: string,
    node: tsModule.VariableStatement | tsModule.FunctionDeclaration
  ) {
    const ts = getTs()

    if (ts.isFunctionDeclaration(node)) {
      if (node.name?.getText() === 'generateMetadata') {
        if (isTyped(node)) return []

        // We annotate with the type in a virtual language service
        const pos = updateVirtualFileWithType(fileName, node, true)
        if (!pos) return []

        return proxyDiagnostics(fileName, pos, node)
      }
    } else {
      for (const declaration of node.declarationList.declarations) {
        if (declaration.name.getText() === 'metadata') {
          if (isTyped(declaration)) break

          // We annotate with the type in a virtual language service
          const pos = updateVirtualFileWithType(fileName, declaration)
          if (!pos) break

          return proxyDiagnostics(fileName, pos, declaration)
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
    const source = getSourceFromVirtualTsEnv(fileName)
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
                  if (isTyped(declaration)) break

                  const declarationFileName =
                    declaration.getSourceFile().fileName
                  const isSameFile = declarationFileName === fileName

                  // We annotate with the type in a virtual language service
                  const pos = updateVirtualFileWithType(
                    declarationFileName,
                    declaration
                  )
                  if (!pos) break

                  const diagnostics = proxyDiagnostics(
                    declarationFileName,
                    pos,
                    declaration
                  )
                  if (diagnostics.length) {
                    if (isSameFile) {
                      return diagnostics
                    } else {
                      return [
                        {
                          file: getSourceFromVirtualTsEnv(fileName),
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

  getCompletionEntryDetails(
    fileName: string,
    position: number,
    entryName: string,
    formatOptions: tsModule.FormatCodeOptions,
    source: string,
    preferences: tsModule.UserPreferences,
    data: tsModule.CompletionEntryData
  ) {
    const node = getMetadataExport(fileName, position)
    if (!node) return
    if (isTyped(node)) return

    // We annotate with the type in a virtual language service
    const pos = updateVirtualFileWithType(fileName, node)
    if (pos === undefined) return

    const newPos = position <= pos[0] ? position : position + pos[1]

    const details = virtualTsEnv.languageService.getCompletionEntryDetails(
      fileName,
      newPos,
      entryName,
      formatOptions,
      source,
      preferences,
      data
    )
    return details
  },

  getQuickInfoAtPosition(fileName: string, position: number) {
    const node = getMetadataExport(fileName, position)
    if (!node) return
    if (isTyped(node)) return

    // We annotate with the type in a virtual language service
    const pos = updateVirtualFileWithType(fileName, node)
    if (pos === undefined) return

    const newPos = position <= pos[0] ? position : position + pos[1]
    const insight = virtualTsEnv.languageService.getQuickInfoAtPosition(
      fileName,
      newPos
    )
    return insight
  },

  getDefinitionAndBoundSpan(fileName: string, position: number) {
    const node = getMetadataExport(fileName, position)
    if (!node) return
    if (isTyped(node)) return
    if (!isPositionInsideNode(position, node)) return
    // We annotate with the type in a virtual language service
    const pos = updateVirtualFileWithType(fileName, node)
    if (pos === undefined) return
    const newPos = position <= pos[0] ? position : position + pos[1]

    const definitionInfoAndBoundSpan =
      virtualTsEnv.languageService.getDefinitionAndBoundSpan(fileName, newPos)

    if (definitionInfoAndBoundSpan) {
      // Adjust the start position of the text span
      if (definitionInfoAndBoundSpan.textSpan.start > pos[0]) {
        definitionInfoAndBoundSpan.textSpan.start -= pos[1]
      }
    }
    return definitionInfoAndBoundSpan
  },
}

export default metadata
