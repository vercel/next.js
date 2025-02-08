/**
 * This is a TypeScript language service plugin for Next.js app directory,
 * it provides the following features:
 *
 * - Warns about disallowed React APIs in server components.
 * - Warns about disallowed layout and page exports.
 * - Autocompletion for entry configurations.
 * - Hover hint and docs for entry configurations.
 */

import { isPositionInsideNode } from './utils'
import { NEXT_TS_ERRORS } from './constant'

import { config as configRule } from './rules/config'
import { server as serverRule } from './rules/server'
import { entry as entryRule } from './rules/entry'
import { clientBoundary as clientBoundaryRule } from './rules/client-boundary'
import { serverBoundary as serverBoundaryRule } from './rules/server-boundary'
import { metadata as metadataRule } from './rules/metadata'
import { error } from './rules/error'
import type ts from 'typescript/lib/tsserverlibrary'
import { TSNextPlugin } from './TSNextPlugin'

export const createTSPlugin: ts.server.PluginModuleFactory = ({
  typescript: ts,
}) => {
  function create(info: ts.server.PluginCreateInfo) {
    const tsNextPlugin = new TSNextPlugin(ts, info)
    const clientBoundary = clientBoundaryRule(tsNextPlugin);
    const config = configRule(tsNextPlugin);
    const entry = entryRule(tsNextPlugin);
    const metadata = metadataRule(tsNextPlugin);
    const serverBoundary = serverBoundaryRule(tsNextPlugin);
    const server = serverRule(tsNextPlugin);

    const virtualFiles: Record<
      string,
      { file: ts.IScriptSnapshot; ver: number }
    > = {}

    const getScriptVersion = info.languageServiceHost.getScriptVersion.bind(
      info.languageServiceHost
    )
    info.languageServiceHost.getScriptVersion = (fileName: string) => {
      tsNextPlugin.log(`[ProxiedLSHost] getScriptVersion(${fileName})`)
      const file = virtualFiles[fileName]
      if (!file) return getScriptVersion(fileName)
      tsNextPlugin.log(`[ProxiedLSHost] getScriptVersion(${fileName}) - ${file.ver}`)
      return file.ver.toString()
    }

    const getScriptSnapshot = info.languageServiceHost.getScriptSnapshot.bind(
      info.languageServiceHost
    )
    info.languageServiceHost.getScriptSnapshot = (fileName: string) => {
      tsNextPlugin.log(`[ProxiedLSHost] getScriptSnapshot(${fileName})`)
      const file = virtualFiles[fileName]
      if (!file) return getScriptSnapshot(fileName)
      tsNextPlugin.log(
        `[ProxiedLSHost] getScriptSnapshot(${fileName}) - ${JSON.stringify(file.file, null, 2)}`
      )
      return file.file
    }

    const getScriptFileNames = info.languageServiceHost.getScriptFileNames.bind(
      info.languageServiceHost
    )
    info.languageServiceHost.getScriptFileNames = () => {
      const names: Set<string> = new Set()
      for (var name in virtualFiles) {
        if (virtualFiles.hasOwnProperty(name)) {
          names.add(name)
        }
      }
      const files = getScriptFileNames()
      for (const file of files) {
        names.add(file)
      }
      tsNextPlugin.log(
        `[ProxiedLSHost] getScriptFileNames() - ${JSON.stringify([...names], null, 2)}`
      )
      return [...names]
    }

    const readFile = info.languageServiceHost.readFile.bind(
      info.languageServiceHost
    )
    info.languageServiceHost.readFile = (fileName: string) => {
      tsNextPlugin.log(`[ProxiedLSHost] readFile(${fileName})`)
      const file = virtualFiles[fileName]
      return file
        ? file.file.getText(0, file.file.getLength())
        : readFile(fileName)
    }

    const fileExists = info.languageServiceHost.fileExists.bind(
      info.languageServiceHost
    )
    info.languageServiceHost.fileExists = (fileName: string) => {
      tsNextPlugin.log(`[ProxiedLSHost] fileExists(${fileName})`)
      return !!virtualFiles[fileName] || fileExists(fileName)
    }

    // TODO(dimitri question for gadzik): why are we patching the `addFile` api, which doesn't exist in the language service host?
    // const addFile = info.languageServiceHost.addFile.bind(
    //   info.languageServiceHost
    // )
    // @ts-ignore
    info.languageServiceHost.addFile = (fileName: string, body: string) => {
      tsNextPlugin.log(`[ProxiedLSHost] addFile(${fileName})\n\n${body}\n<<EOF>>`)
      const snap = ts.ScriptSnapshot.fromString(body)
      snap.getChangeRange = (_) => undefined
      const existing = virtualFiles[fileName]
      if (existing) {
        virtualFiles[fileName].ver++
        virtualFiles[fileName].file = snap
      } else {
        virtualFiles[fileName] = { ver: 2, file: snap }
      }

      // This is the same function call that the Svelte TS plugin makes
      // @ts-expect-error internal API since TS 5.5
      info.project.markAsDirty?.()
      // return addFile(fileName, body) // see TODO above
    }

    // Set up decorator object
    const proxy = Object.create(null)
    for (let k of Object.keys(info.languageService)) {
      const x = (info.languageService as any)[k]
      proxy[k] = (...args: Array<{}>) => x.apply(info.languageService, args)
    }

    // Get plugin options
    // config is the plugin options from the user's tsconfig.json
    // e.g. { "plugins": [{ "name": "next", "enabled": true }] }
    // config will be { "name": "next", "enabled": true }
    // The default user config is { "name": "next" }
    const isPluginEnabled = info.config.enabled ?? true

    if (!isPluginEnabled) {
      return proxy
    }

    // Auto completion
    proxy.getCompletionsAtPosition = (
      fileName: string,
      position: number,
      options: any
    ) => {
      let prior = info.languageService.getCompletionsAtPosition(
        fileName,
        position,
        options
      ) || {
        isGlobalCompletion: false,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: [],
      }

      if (!tsNextPlugin.isAppEntryFile(fileName)) return prior

      // If it's a server entry.
      const { isClientEntry } = tsNextPlugin.getEntryInfo(fileName)
      if (!isClientEntry) {
        // Remove specified entries from completion list
        prior.entries = server.filterCompletionsAtPosition(prior.entries)

        // Provide autocompletion for metadata fields
        prior = metadata.filterCompletionsAtPosition(
          fileName,
          position,
          options,
          prior
        )
      }

      // Add auto completions for export configs.
      config.addCompletionsAtPosition(fileName, position, prior)

      const source = tsNextPlugin.getSource(fileName)
      if (!source) return prior

      ts.forEachChild(source!, (node) => {
        // Auto completion for default export function's props.
        if (
          isPositionInsideNode(position, node) &&
          tsNextPlugin.isDefaultFunctionExport(node)
        ) {
          prior.entries.push(
            ...entry.getCompletionsAtPosition(
              fileName,
              node as ts.FunctionDeclaration,
              position
            )
          )
        }
      })

      return prior
    }

    // Show auto completion details
    proxy.getCompletionEntryDetails = (
      fileName: string,
      position: number,
      entryName: string,
      formatOptions: ts.FormatCodeOptions,
      source: string,
      preferences: ts.UserPreferences,
      data: ts.CompletionEntryData
    ) => {
      const entryCompletionEntryDetails = config.getCompletionEntryDetails(
        entryName,
        data
      )
      if (entryCompletionEntryDetails) return entryCompletionEntryDetails

      const metadataCompletionEntryDetails =
        metadata.getCompletionEntryDetails(
          fileName,
          position,
          entryName,
          formatOptions,
          source,
          preferences,
          data
        )
      if (metadataCompletionEntryDetails) return metadataCompletionEntryDetails

      return info.languageService.getCompletionEntryDetails(
        fileName,
        position,
        entryName,
        formatOptions,
        source,
        preferences,
        data
      )
    }

    // Quick info
    proxy.getQuickInfoAtPosition = (fileName: string, position: number) => {
      const prior = info.languageService.getQuickInfoAtPosition(
        fileName,
        position
      )
      if (!tsNextPlugin.isAppEntryFile(fileName)) return prior

      // Remove type suggestions for disallowed APIs in server components.
      const { isClientEntry } = tsNextPlugin.getEntryInfo(fileName)
      if (!isClientEntry) {
        const definitions = info.languageService.getDefinitionAtPosition(
          fileName,
          position
        )
        if (
          definitions &&
          server.hasDisallowedReactAPIDefinition(definitions)
        ) {
          return
        }

        const metadataInfo = metadata.getQuickInfoAtPosition(
          fileName,
          position
        )
        if (metadataInfo) return metadataInfo
      }

      const overridden = config.getQuickInfoAtPosition(
        fileName,
        position
      )
      if (overridden) return overridden

      return prior
    }

    // Show errors for disallowed imports
    proxy.getSemanticDiagnostics = (fileName: string) => {
      const prior = info.languageService.getSemanticDiagnostics(fileName)
      const source = tsNextPlugin.getSource(fileName)
      if (!source) return prior

      let isClientEntry = false
      let isServerEntry = false
      const isAppEntry = tsNextPlugin.isAppEntryFile(fileName)

      try {
        ;({ isClientEntry, isServerEntry } = tsNextPlugin.getEntryInfo(fileName, true))
      } catch (e: any) {
        prior.push({
          file: source,
          category: ts.DiagnosticCategory.Error,
          code: NEXT_TS_ERRORS.MISPLACED_ENTRY_DIRECTIVE,
          ...e,
        })
      }

      if (tsNextPlugin.isInsideApp(fileName)) {
        const errorDiagnostic = error(tsNextPlugin).getSemanticDiagnostics(
          source!,
          isClientEntry
        )
        prior.push(...errorDiagnostic)
      }

      ts.forEachChild(source!, (node) => {
        if (ts.isImportDeclaration(node)) {
          // import ...
          if (isAppEntry) {
            if (!isClientEntry || isServerEntry) {
              // Check if it has valid imports in the server layer
              const diagnostics =
                server.getSemanticDiagnosticsForImportDeclaration(source, node)
              prior.push(...diagnostics)
            }
          }
        } else if (
          ts.isVariableStatement(node) &&
          node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        ) {
          // export const ...
          if (isAppEntry) {
            // Check if it has correct option exports
            const diagnostics =
              config.getSemanticDiagnosticsForExportVariableStatement(
                source,
                node
              )
            const metadataDiagnostics = isClientEntry
              ? metadata.getSemanticDiagnosticsForExportVariableStatementInClientEntry(
                  fileName,
                  node
                )
              : metadata.getSemanticDiagnosticsForExportVariableStatement(
                  fileName,
                  node
                )
            prior.push(...diagnostics, ...metadataDiagnostics)
          }

          if (isClientEntry) {
            prior.push(
              ...clientBoundary.getSemanticDiagnosticsForExportVariableStatement(
                source,
                node
              )
            )
          }

          if (isServerEntry) {
            prior.push(
              ...serverBoundary.getSemanticDiagnosticsForExportVariableStatement(
                source,
                node
              )
            )
          }
        } else if (tsNextPlugin.isDefaultFunctionExport(node)) {
          // export default function ...
          if (isAppEntry) {
            const diagnostics = entry.getSemanticDiagnostics(
              fileName,
              source,
              node
            )
            prior.push(...diagnostics)
          }

          if (isClientEntry) {
            prior.push(
              ...clientBoundary.getSemanticDiagnosticsForFunctionExport(
                source,
                node
              )
            )
          }

          if (isServerEntry) {
            prior.push(
              ...serverBoundary.getSemanticDiagnosticsForFunctionExport(
                source,
                node
              )
            )
          }
        } else if (
          ts.isFunctionDeclaration(node) &&
          node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        ) {
          // export function ...
          if (isAppEntry) {
            const metadataDiagnostics = isClientEntry
              ? metadata.getSemanticDiagnosticsForExportVariableStatementInClientEntry(
                  fileName,
                  node
                )
              : metadata.getSemanticDiagnosticsForExportVariableStatement(
                  fileName,
                  node
                )
            prior.push(...metadataDiagnostics)
          }

          if (isClientEntry) {
            prior.push(
              ...clientBoundary.getSemanticDiagnosticsForFunctionExport(
                source,
                node
              )
            )
          }

          if (isServerEntry) {
            prior.push(
              ...serverBoundary.getSemanticDiagnosticsForFunctionExport(
                source,
                node
              )
            )
          }
        } else if (ts.isExportDeclaration(node)) {
          // export { ... }
          if (isAppEntry) {
            const metadataDiagnostics = isClientEntry
              ? metadata.getSemanticDiagnosticsForExportDeclarationInClientEntry(
                  fileName,
                  node
                )
              : metadata.getSemanticDiagnosticsForExportDeclaration(
                  fileName,
                  node
                )
            prior.push(...metadataDiagnostics)
          }

          if (isServerEntry) {
            prior.push(
              ...serverBoundary.getSemanticDiagnosticsForExportDeclaration(
                source,
                node
              )
            )
          }
        }
      })

      return prior
    }

    // Get definition and link for specific node
    proxy.getDefinitionAndBoundSpan = (fileName: string, position: number) => {
      const { isClientEntry } = tsNextPlugin.getEntryInfo(fileName)
      if (tsNextPlugin.isAppEntryFile(fileName) && !isClientEntry) {
        const metadataDefinition = metadata.getDefinitionAndBoundSpan(
          fileName,
          position
        )
        if (metadataDefinition) return metadataDefinition
      }

      return info.languageService.getDefinitionAndBoundSpan(fileName, position)
    }

    return proxy
  }

  return { create }
}
