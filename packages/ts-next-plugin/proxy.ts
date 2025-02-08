import { isPositionInsideNode } from './utils'
import { NEXT_TS_ERRORS } from './constant'

import { config as configRule } from './rules/config'
import { server as serverRule } from './rules/server'
import { entry as entryRule } from './rules/entry'
import { clientBoundary as clientBoundaryRule } from './rules/client-boundary'
import { serverBoundary as serverBoundaryRule } from './rules/server-boundary'
import { metadata as metadataRule } from './rules/metadata'
import { error } from './rules/error'
import type tsModule from 'typescript/lib/tsserverlibrary'
import type { TSNextPlugin } from './TSNextPlugin'

export const createProxy = (tsNextPlugin: TSNextPlugin) => {
  const { info } = tsNextPlugin
  const clientBoundary = clientBoundaryRule(tsNextPlugin)
  const config = configRule(tsNextPlugin)
  const entry = entryRule(tsNextPlugin)
  const metadata = metadataRule(tsNextPlugin)
  const serverBoundary = serverBoundaryRule(tsNextPlugin)
  const server = serverRule(tsNextPlugin)

  // Set up decorator object
  const proxy = Object.create(null)
  for (let k of Object.keys(info.languageService)) {
    const x = (info.languageService as any)[k]
    proxy[k] = (...args: Array<{}>) => x.apply(info.languageService, args)
  }

  const pluginOptions = info.config ?? {
    enabled: true,
  }
  if (!pluginOptions.enabled) {
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

    tsNextPlugin.ts.forEachChild(source!, (node) => {
      // Auto completion for default export function's props.
      if (
        isPositionInsideNode(position, node) &&
        tsNextPlugin.isDefaultFunctionExport(node)
      ) {
        prior.entries.push(
          ...entry.getCompletionsAtPosition(
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
    const entryCompletionEntryDetails = config.getCompletionEntryDetails(
      entryName,
      data
    )
    if (entryCompletionEntryDetails) return entryCompletionEntryDetails

    const metadataCompletionEntryDetails = metadata.getCompletionEntryDetails(
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
      if (definitions && server.hasDisallowedReactAPIDefinition(definitions)) {
        return
      }

      const metadataInfo = metadata.getQuickInfoAtPosition(fileName, position)
      if (metadataInfo) return metadataInfo
    }

    const overridden = config.getQuickInfoAtPosition(fileName, position)
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
      ;({ isClientEntry, isServerEntry } = tsNextPlugin.getEntryInfo(
        fileName,
        true
      ))
    } catch (e: any) {
      prior.push({
        file: source,
        category: tsNextPlugin.ts.DiagnosticCategory.Error,
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

    tsNextPlugin.ts.forEachChild(source!, (node) => {
      if (tsNextPlugin.ts.isImportDeclaration(node)) {
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
        tsNextPlugin.ts.isVariableStatement(node) &&
        node.modifiers?.some((m) => m.kind === tsNextPlugin.ts.SyntaxKind.ExportKeyword)
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
        tsNextPlugin.ts.isFunctionDeclaration(node) &&
        node.modifiers?.some((m) => m.kind === tsNextPlugin.ts.SyntaxKind.ExportKeyword)
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
      } else if (tsNextPlugin.ts.isExportDeclaration(node)) {
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
