import { NEXT_TS_ERRORS } from '../constant'
import type { TSNextPlugin } from '../TSNextPlugin'
import { isPositionInsideNode } from '../utils'
import type tsModule from 'typescript/lib/tsserverlibrary'

const TYPE_ANNOTATION = ': Metadata | null'
const TYPE_ANNOTATION_ASYNC = ': Promise<Metadata | null>'
const TYPE_IMPORT = `\n\nimport type { Metadata } from 'next'`

const updatedFilePositionsCache = new Map<string, number[]>()

function cacheKey(
  fileName: string,
  isFunction: boolean,
  isGenerateMetadata?: boolean
) {
  return `${fileName}:${isFunction ? 'function' : 'variable'}:${isGenerateMetadata ? 'generateMetadata' : 'metadata'}`
}

function isTyped(
  node: tsModule.VariableDeclaration | tsModule.FunctionDeclaration
) {
  return node.type !== undefined
}

/** these are helper functions related to metadata handling */
export const metadata = (tsNextPlugin: TSNextPlugin) => ({
  proxyDiagnostics(
    fileName: string,
    pos: number[],
    n: tsModule.VariableDeclaration | tsModule.FunctionDeclaration
  ) {
    // Get diagnostics
    const { languageService } = tsNextPlugin.info
    const diagnostics = languageService.getSemanticDiagnostics(fileName)
    const source = tsNextPlugin.getSource(fileName)

    // Filter and map the results
    return diagnostics
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
  },

  getDefinitionAndBoundSpan(
    fileName: Parameters<
      tsModule.LanguageService['getDefinitionAndBoundSpan']
    >[0],
    position: Parameters<
      tsModule.LanguageService['getDefinitionAndBoundSpan']
    >[1]
  ): ReturnType<tsModule.LanguageService['getDefinitionAndBoundSpan']> {
    const node = this.getMetadataExport(fileName, position)
    if (!node) return
    if (isTyped(node)) return
    if (!isPositionInsideNode(position, node)) return
    // We annotate with the type in a virtual language service
    const pos = this.updateVirtualFileWithType(fileName, node)
    if (pos === undefined) return
    const { languageService } = tsNextPlugin.info
    const newPos = position <= pos[0] ? position : position + pos[1]

    const definitionInfoAndBoundSpan =
      languageService.getDefinitionAndBoundSpan(fileName, newPos)

    if (definitionInfoAndBoundSpan) {
      // Adjust the start position of the text span
      if (definitionInfoAndBoundSpan.textSpan.start > pos[0]) {
        definitionInfoAndBoundSpan.textSpan.start -= pos[1]
      }
    }
    return definitionInfoAndBoundSpan
  },

  getQuickInfoAtPosition(
    fileName: Parameters<tsModule.LanguageService['getQuickInfoAtPosition']>[0],
    position: Parameters<tsModule.LanguageService['getQuickInfoAtPosition']>[1]
  ): ReturnType<tsModule.LanguageService['getQuickInfoAtPosition']> {
    tsNextPlugin.log('getQuickInfoAtPosition')
    const node = this.getMetadataExport(fileName, position)
    if (!node) return
    if (isTyped(node)) return

    // We annotate with the type in a virtual language service
    const pos = this.updateVirtualFileWithType(fileName, node)
    if (pos === undefined) return

    const { languageService } = tsNextPlugin.info
    const newPos = position <= pos[0] ? position : position + pos[1]
    const insight = languageService.getQuickInfoAtPosition(fileName, newPos)
    return insight
  },

  getCompletionEntryDetails(
    fileName: Parameters<
      tsModule.LanguageService['getCompletionEntryDetails']
    >[0],
    position: Parameters<
      tsModule.LanguageService['getCompletionEntryDetails']
    >[1],
    entryName: Parameters<
      tsModule.LanguageService['getCompletionEntryDetails']
    >[2],
    formatOptions: Parameters<
      tsModule.LanguageService['getCompletionEntryDetails']
    >[3],
    source: Parameters<
      tsModule.LanguageService['getCompletionEntryDetails']
    >[4],
    preferences: Parameters<
      tsModule.LanguageService['getCompletionEntryDetails']
    >[5],
    data: Parameters<tsModule.LanguageService['getCompletionEntryDetails']>[6]
  ): ReturnType<tsModule.LanguageService['getCompletionEntryDetails']> {
    tsNextPlugin.log('getCompletionEntryDetails')
    const node = this.getMetadataExport(fileName, position)
    if (!node) return
    if (isTyped(node)) return

    // We annotate with the type in a virtual language service
    const pos = this.updateVirtualFileWithType(fileName, node)
    if (pos === undefined) return

    const { languageService } = tsNextPlugin.info
    const newPos = position <= pos[0] ? position : position + pos[1]

    const details = languageService.getCompletionEntryDetails(
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

  updateVirtualFileWithType(
    fileName: string,
    node: tsModule.VariableDeclaration | tsModule.FunctionDeclaration,
    isGenerateMetadata?: boolean
  ) {
    const isFunction = tsNextPlugin.ts.isFunctionDeclaration(node)
    const key = cacheKey(fileName, isFunction, isGenerateMetadata)

    if (updatedFilePositionsCache.has(key)) {
      return updatedFilePositionsCache.get(key)
    }

    let nodeEnd: number

    if (isFunction) {
      nodeEnd = node.body!.getFullStart()
    } else {
      nodeEnd = node.name.getFullStart() + node.name.getFullWidth()
    }

    // If the node is already typed, we don't need to do anything
    if (!isTyped(node)) {
      const source = tsNextPlugin.getSource(fileName)
      if (!source) return

      // We annotate with the type in a virtual language service
      const sourceText = source.getFullText()
      let annotation: string

      if (isFunction) {
        if (isGenerateMetadata) {
          const isAsync = node.modifiers?.some(
            (m) => m.kind === tsNextPlugin.ts.SyntaxKind.AsyncKeyword
          )
          annotation = isAsync ? TYPE_ANNOTATION_ASYNC : TYPE_ANNOTATION
        } else {
          return
        }
      } else {
        annotation = TYPE_ANNOTATION
      }

      const newSource =
        sourceText.slice(0, nodeEnd) +
        annotation +
        sourceText.slice(nodeEnd) +
        TYPE_IMPORT

      const { languageServiceHost } = tsNextPlugin.info
      // Add the file to the virtual language service
      // This will trigger TypeScript to re-analyze the workspace
      // @ts-expect-error TODO: this is super sus
      languageServiceHost.addFile(fileName, newSource)

      const pos = [nodeEnd, annotation.length]
      updatedFilePositionsCache.set(key, pos)

      return pos
    }

    return [nodeEnd, 0]
  },

  /** Find the `export const metadata = ...` node. */
  getMetadataExport(fileName: string, position: number) {
    const source = tsNextPlugin.getSource(fileName)
    let metadataExport: tsModule.VariableDeclaration | undefined

    if (source) {
      tsNextPlugin.ts.forEachChild(source, function visit(node) {
        if (metadataExport) return

        // Covered by this node
        if (isPositionInsideNode(position, node)) {
          // Export variable
          if (
            tsNextPlugin.ts.isVariableStatement(node) &&
            node.modifiers?.some(
              (m) => m.kind === tsNextPlugin.ts.SyntaxKind.ExportKeyword
            )
          ) {
            if (
              tsNextPlugin.ts.isVariableDeclarationList(node.declarationList)
            ) {
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
  },

  filterCompletionsAtPosition(
    fileName: string,
    position: number,
    options: any,
    prior: tsModule.WithMetadata<tsModule.CompletionInfo>
  ) {
    const node = this.getMetadataExport(fileName, position)
    if (!node) return prior

    const { languageService } = tsNextPlugin.info

    // We annotate with the type in a virtual language service
    const pos = this.updateVirtualFileWithType(fileName, node)
    if (pos === undefined) return prior

    // Get completions
    const newPos = position <= pos[0] ? position : position + pos[1]
    const completions = languageService.getCompletionsAtPosition(
      fileName,
      newPos,
      options
    )

    if (completions) {
      completions.isIncomplete = true

      completions.entries = completions.entries
        .filter((e) => {
          return [
            tsNextPlugin.ts.ScriptElementKind.memberVariableElement,
            tsNextPlugin.ts.ScriptElementKind.typeElement,
            tsNextPlugin.ts.ScriptElementKind.string,
          ].includes(e.kind)
        })
        .map((e) => {
          const insertText =
            e.kind ===
              tsNextPlugin.ts.ScriptElementKind.memberVariableElement &&
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
    const source = tsNextPlugin.getSource(fileName)

    // It is not allowed to export `metadata` or `generateMetadata` in client entry
    if (tsNextPlugin.ts.isFunctionDeclaration(node)) {
      if (node.name?.getText() === 'generateMetadata') {
        return [
          {
            file: source,
            category: tsNextPlugin.ts.DiagnosticCategory.Error,
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
              category: tsNextPlugin.ts.DiagnosticCategory.Error,
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
    if (tsNextPlugin.ts.isFunctionDeclaration(node)) {
      if (node.name?.getText() === 'generateMetadata') {
        if (isTyped(node)) return []

        // We annotate with the type in a virtual language service
        const pos = this.updateVirtualFileWithType(fileName, node, true)
        if (!pos) return []

        return this.proxyDiagnostics(fileName, pos, node)
      }
    } else {
      for (const declaration of node.declarationList.declarations) {
        if (declaration.name.getText() === 'metadata') {
          if (isTyped(declaration)) break

          // We annotate with the type in a virtual language service
          const pos = this.updateVirtualFileWithType(fileName, declaration)
          if (!pos) break

          return this.proxyDiagnostics(fileName, pos, declaration)
        }
      }
    }
    return []
  },

  getSemanticDiagnosticsForExportDeclarationInClientEntry(
    fileName: string,
    node: tsModule.ExportDeclaration
  ) {
    const source = tsNextPlugin.getSource(fileName)
    const diagnostics: tsModule.Diagnostic[] = []

    const exportClause = node.exportClause
    if (exportClause && tsNextPlugin.ts.isNamedExports(exportClause)) {
      for (const e of exportClause.elements) {
        if (['generateMetadata', 'metadata'].includes(e.name.getText())) {
          diagnostics.push({
            file: source,
            category: tsNextPlugin.ts.DiagnosticCategory.Error,
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
    const exportClause = node.exportClause
    if (exportClause && tsNextPlugin.ts.isNamedExports(exportClause)) {
      for (const e of exportClause.elements) {
        if (e.name.getText() === 'metadata') {
          // Get the original declaration node of element
          const typeChecker = tsNextPlugin.getTypeChecker()
          if (typeChecker) {
            const symbol = typeChecker.getSymbolAtLocation(e.name)
            if (symbol) {
              const metadataSymbol = typeChecker.getAliasedSymbol(symbol)
              if (metadataSymbol && metadataSymbol.declarations) {
                const declaration = metadataSymbol.declarations[0]
                if (
                  declaration &&
                  tsNextPlugin.ts.isVariableDeclaration(declaration)
                ) {
                  if (isTyped(declaration)) break

                  const declarationFileName =
                    declaration.getSourceFile().fileName
                  const isSameFile = declarationFileName === fileName

                  // We annotate with the type in a virtual language service
                  const pos = this.updateVirtualFileWithType(
                    declarationFileName,
                    declaration
                  )
                  if (!pos) break

                  const diagnostics = this.proxyDiagnostics(
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
                          file: tsNextPlugin.getSource(fileName),
                          category: tsNextPlugin.ts.DiagnosticCategory.Error,
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
})
