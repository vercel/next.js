import { getInfo, getSource, getTs, isPositionInsideNode } from '../utils'

// Find the `export const metadata = ...` node.
function getMetadataExport(fileName: string, position: number) {
  const source = getSource(fileName)
  let metadataExport: ts.VariableDeclaration | undefined

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

let cachedProxiedLanguageService: ts.LanguageService | undefined
let cachedProxiedLanguageServiceHost: ts.LanguageServiceHost | undefined
function getProxiedLanguageService() {
  if (cachedProxiedLanguageService)
    return {
      languageService: cachedProxiedLanguageService as ts.LanguageService,
      languageServiceHost:
        cachedProxiedLanguageServiceHost as ts.LanguageServiceHost & {
          addFile: (fileName: string, body: string) => void
        },
    }

  const languageServiceHost = getInfo().languageServiceHost

  const ts = getTs()
  class ProxiedLanguageServiceHost implements ts.LanguageServiceHost {
    files: { [fileName: string]: { file: ts.IScriptSnapshot; ver: number } } =
      {}

    log = () => {}
    trace = () => {}
    error = () => {}
    getCompilationSettings = () => languageServiceHost.getCompilationSettings()
    getScriptIsOpen = () => true
    getCurrentDirectory = () => languageServiceHost.getCurrentDirectory()
    getDefaultLibFileName = (o: any) =>
      languageServiceHost.getDefaultLibFileName(o)

    getScriptVersion = (fileName: string) => {
      const file = this.files[fileName]
      if (!file) return languageServiceHost.getScriptVersion(fileName)
      return file.ver.toString()
    }

    getScriptSnapshot = (fileName: string) => {
      const file = this.files[fileName]
      if (!file) return languageServiceHost.getScriptSnapshot(fileName)
      return file.file
    }

    getScriptFileNames(): string[] {
      const names: Set<string> = new Set()
      for (var name in this.files) {
        if (this.files.hasOwnProperty(name)) {
          names.add(name)
        }
      }
      const files = languageServiceHost.getScriptFileNames()
      for (const file of files) {
        names.add(file)
      }
      return [...names]
    }

    addFile(fileName: string, body: string) {
      const snap = ts.ScriptSnapshot.fromString(body)
      snap.getChangeRange = (_) => undefined
      const existing = this.files[fileName]
      if (existing) {
        this.files[fileName].ver++
        this.files[fileName].file = snap
      } else {
        this.files[fileName] = { ver: 1, file: snap }
      }
    }

    readFile(fileName: string) {
      const file = this.files[fileName]
      return file
        ? file.file.getText(0, file.file.getLength())
        : languageServiceHost.readFile(fileName)
    }
    fileExists(fileName: string) {
      return (
        this.files[fileName] !== undefined ||
        languageServiceHost.fileExists(fileName)
      )
    }
  }

  cachedProxiedLanguageServiceHost = new ProxiedLanguageServiceHost()
  cachedProxiedLanguageService = ts.createLanguageService(
    cachedProxiedLanguageServiceHost,
    ts.createDocumentRegistry()
  )
  return {
    languageService: cachedProxiedLanguageService as ts.LanguageService,
    languageServiceHost:
      cachedProxiedLanguageServiceHost as ts.LanguageServiceHost & {
        addFile: (fileName: string, body: string) => void
      },
  }
}

function updateVirtualFileWithType(
  fileName: string,
  node: ts.VariableDeclaration
) {
  const source = getSource(fileName)
  if (!source) return

  // We annotate with the type in a vritual language service
  const sourceText = source.getFullText()
  const nodeEnd = node.name.getFullStart() + node.name.getFullWidth()
  const newSource =
    sourceText.slice(0, nodeEnd) +
    TYPE_ANOTATION +
    sourceText.slice(nodeEnd) +
    TYPE_IMPORT
  const { languageServiceHost } = getProxiedLanguageService()
  languageServiceHost.addFile(fileName, newSource)

  return nodeEnd
}

function isTyped(node: ts.VariableDeclaration) {
  return node.type !== undefined
}

const TYPE_ANOTATION = ': Metadata'
const TYPE_IMPORT = `import { Metadata } from 'next/dist/lib/metadata/types/metadata-interface'`

const metadata = {
  filterCompletionsAtPosition(
    fileName: string,
    position: number,
    prior: ts.WithMetadata<ts.CompletionInfo>
  ) {
    const node = getMetadataExport(fileName, position)
    if (!node) return prior
    if (isTyped(node)) return prior

    const ts = getTs()

    // We annotate with the type in a vritual language service
    const nodeEnd = updateVirtualFileWithType(fileName, node)
    if (nodeEnd === undefined) return prior

    // Get completions
    const { languageService } = getProxiedLanguageService()
    const newPos =
      position <= nodeEnd ? position : position + TYPE_ANOTATION.length
    const completions = languageService.getCompletionsAtPosition(
      fileName,
      newPos,
      undefined
    )

    if (completions) {
      completions.entries = completions.entries
        .filter((e) => {
          return e.kind === ts.ScriptElementKind.memberVariableElement
        })
        .map((e) => {
          return {
            name: e.name,
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

  getSemanticDiagnosticsForExportVariableStatement(
    fileName: string,
    node: ts.VariableStatement
  ) {
    const source = getSource(fileName)

    for (const declaration of node.declarationList.declarations) {
      if (declaration.name.getText() === 'metadata') {
        if (isTyped(declaration)) break

        // We annotate with the type in a vritual language service
        const nodeEnd = updateVirtualFileWithType(fileName, declaration)
        if (!nodeEnd) break

        // Get diagnostics
        const { languageService } = getProxiedLanguageService()
        const diagnostics = languageService.getSemanticDiagnostics(fileName)

        // Filter and map the results
        return diagnostics
          .filter((d) => {
            if (d.start === undefined || d.length === undefined) return false
            if (d.start < declaration.getFullStart()) return false
            if (
              d.start + d.length >
              declaration.getFullStart() +
                declaration.getFullWidth() +
                TYPE_ANOTATION.length
            )
              return false
            return true
          })
          .map((d) => {
            return {
              file: source,
              category: d.category,
              code: d.code,
              messageText: d.messageText,
              start:
                d.start! <= nodeEnd
                  ? d.start
                  : d.start! - TYPE_ANOTATION.length,
              length: d.length,
            }
          })
      }
    }
    return []
  },

  getCompletionEntryDetails(
    fileName: string,
    position: number,
    entryName: string,
    formatOptions: ts.FormatCodeOptions,
    source: string,
    preferences: ts.UserPreferences,
    data: ts.CompletionEntryData
  ) {
    const node = getMetadataExport(fileName, position)
    if (!node) return
    if (isTyped(node)) return

    // We annotate with the type in a vritual language service
    const nodeEnd = updateVirtualFileWithType(fileName, node)
    if (nodeEnd === undefined) return

    const { languageService } = getProxiedLanguageService()
    const newPos =
      position <= nodeEnd ? position : position + TYPE_ANOTATION.length

    return languageService.getCompletionEntryDetails(
      fileName,
      newPos,
      entryName,
      formatOptions,
      source,
      preferences,
      data
    )
  },

  getQuickInfoAtPosition(fileName: string, position: number) {
    const node = getMetadataExport(fileName, position)
    if (!node) return
    if (isTyped(node)) return

    // We annotate with the type in a vritual language service
    const nodeEnd = updateVirtualFileWithType(fileName, node)
    if (nodeEnd === undefined) return

    const { languageService } = getProxiedLanguageService()
    const newPos =
      position <= nodeEnd ? position : position + TYPE_ANOTATION.length
    const insight = languageService.getQuickInfoAtPosition(fileName, newPos)
    return insight
  },
}

export default metadata
