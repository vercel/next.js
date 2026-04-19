/**
 * This is a TypeScript language service plugin for Next.js app directory,
 * it provides the following features:
 *
 * - Warns about disallowed React APIs in server components.
 * - Warns about disallowed layout and page exports.
 * - Autocompletion for entry configurations.
 * - Hover hint and docs for entry configurations.
 */

import {
  init,
  getEntryInfo,
  isAppEntryFile,
  isDefaultFunctionExport,
  isPositionInsideNode,
  getSource,
  isInsideApp,
} from './utils'
import { NEXT_TS_ERRORS } from './constant'

import entryConfig from './rules/config'
import serverLayer from './rules/server'
import entryDefault from './rules/entry'
import clientBoundary from './rules/client-boundary'
import serverBoundary from './rules/server-boundary'
import metadata from './rules/metadata'
import errorEntry from './rules/error'
import type tsModule from 'typescript/lib/tsserverlibrary'

export const createTSPlugin: tsModule.server.PluginModuleFactory = ({
  typescript: ts,
}) => {
  function create(info: tsModule.server.PluginCreateInfo) {
    // Get plugin options
    // config is the plugin options from the user's tsconfig.json
    // e.g. { "plugins": [{ "name": "next", "enabled": true }] }
    // config will be { "name": "next", "enabled": true }
    // The default user config is { "name": "next" }
    const isPluginEnabled = info.config.enabled ?? true

    if (!isPluginEnabled) {
      return info.languageService
    }

    init({
      ts,
      info,
    })

    // Set up decorator object
    const proxy: tsModule.LanguageService = Object.create(null)
    for (let k of Object.keys(info.languageService)) {
      const x = info.languageService[k as keyof tsModule.LanguageService]
      // @ts-expect-error - JS runtime trickery which is tricky to type tersely
      proxy[k] = (...args: Array<{}>) => x.apply(info.languageService, args)
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
      if (!isAppEntryFile(fileName)) return prior

      // If it's a server entry.
      const entryInfo = getEntryInfo(fileName)
      if (!entryInfo.client) {
        // Remove specified entries from completion list
        prior.entries = serverLayer.filterCompletionsAtPosition(prior.entries)
      }

      // Add auto completions for export configs.
      entryConfig.addCompletionsAtPosition(fileName, position, prior)

      const source = getSource(fileName)
      if (!source) return prior

      ts.forEachChild(source!, (node) => {
        // Auto completion for default export function's props.
        if (
          isPositionInsideNode(position, node) &&
          isDefaultFunctionExport(node)
        ) {
          prior.entries.push(
            ...entryDefault.getCompletionsAtPosition(
              fileName,
              node as tsModule.FunctionDeclaration,
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
      formatOptions: tsModule.FormatCodeOptions,
      source: string,
      preferences: tsModule.UserPreferences,
      data: tsModule.CompletionEntryData
    ) => {
      const entryCompletionEntryDetails = entryConfig.getCompletionEntryDetails(
        entryName,
        data,
        fileName
      )
      if (entryCompletionEntryDetails) return entryCompletionEntryDetails

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
      if (!isAppEntryFile(fileName)) return prior

      // Remove type suggestions for disallowed APIs in server components.
      const entryInfo = getEntryInfo(fileName)
      if (!entryInfo.client) {
        const definitions = info.languageService.getDefinitionAtPosition(
          fileName,
          position
        )
        if (
          definitions &&
          serverLayer.hasDisallowedReactAPIDefinition(definitions)
        ) {
          return
        }
      }

      const overridden = entryConfig.getQuickInfoAtPosition(fileName, position)
      if (overridden) return overridden

      return prior
    }

    // Show errors for disallowed imports
    proxy.getSemanticDiagnostics = (fileName: string) => {
      const prior = info.languageService.getSemanticDiagnostics(fileName)
      const source = getSource(fileName)
      if (!source) return prior

      let isClientEntry = false
      let isServerEntry = false
      const isAppEntry = isAppEntryFile(fileName)

      try {
        const entryInfo = getEntryInfo(fileName, true)
        isClientEntry = entryInfo.client
        isServerEntry = entryInfo.server
      } catch (e: any) {
        prior.push({
          file: source,
          category: ts.DiagnosticCategory.Error,
          code: NEXT_TS_ERRORS.MISPLACED_ENTRY_DIRECTIVE,
          ...e,
        })
        isClientEntry = false
        isServerEntry = false
      }

      if (isInsideApp(fileName)) {
        const errorDiagnostic = errorEntry.getSemanticDiagnostics(
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
                serverLayer.getSemanticDiagnosticsForImportDeclaration(
                  source,
                  node
                )
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
              entryConfig.getSemanticDiagnosticsForExportVariableStatement(
                source,
                node
              )
            const metadataDiagnostics = isClientEntry
              ? metadata.client.getSemanticDiagnosticsForExportVariableStatement(
                  fileName,
                  node
                )
              : metadata.server.getSemanticDiagnosticsForExportVariableStatement(
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
        } else if (isDefaultFunctionExport(node)) {
          // export default function ...
          if (isAppEntry) {
            const diagnostics = entryDefault.getSemanticDiagnostics(
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
              ? metadata.client.getSemanticDiagnosticsForExportVariableStatement(
                  fileName,
                  node
                )
              : metadata.server.getSemanticDiagnosticsForExportVariableStatement(
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
              ? metadata.client.getSemanticDiagnosticsForExportDeclaration(
                  fileName,
                  node
                )
              : metadata.server.getSemanticDiagnosticsForExportDeclaration(
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

    return proxy
  }

  return { create }
}
