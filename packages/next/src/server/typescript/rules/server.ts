import { DISALLOWED_SERVER_REACT_APIS, NEXT_TS_ERRORS } from '../constant'
import { getTs } from '../utils'

const serverLayer = {
  // On the server layer we need to filter out some invalid completion results.
  filterCompletionsAtPosition(entries: ts.CompletionEntry[]) {
    return entries.filter((e: ts.CompletionEntry) => {
      // Remove disallowed React APIs.
      if (
        DISALLOWED_SERVER_REACT_APIS.includes(e.name) &&
        e.source === 'react'
      ) {
        return false
      }
      return true
    })
  },

  // Filter out quick info for some React APIs.
  hasDisallowedReactAPIDefinition(definitions: readonly ts.DefinitionInfo[]) {
    return definitions?.some(
      (d) =>
        DISALLOWED_SERVER_REACT_APIS.includes(d.name) &&
        d.containerName === 'React'
    )
  },

  // Give errors about disallowed imports such as `useState`.
  getSemanticDiagnosticsForImportDeclaration(
    source: ts.SourceFile,
    node: ts.ImportDeclaration
  ) {
    const ts = getTs()

    const diagnostics: ts.Diagnostic[] = []

    const importPath = node.moduleSpecifier.getText(source!)
    if (importPath === "'react'" || importPath === '"react"') {
      // Check if it imports "useState"
      const importClause = node.importClause
      if (importClause) {
        const namedBindings = importClause.namedBindings
        if (namedBindings && ts.isNamedImports(namedBindings)) {
          const elements = namedBindings.elements
          for (const element of elements) {
            const name = element.name.getText(source!)
            if (DISALLOWED_SERVER_REACT_APIS.includes(name)) {
              diagnostics.push({
                file: source,
                category: ts.DiagnosticCategory.Error,
                code: NEXT_TS_ERRORS.INVALID_SERVER_API,
                messageText: `"${name}" is not allowed in Server Components.`,
                start: element.name.getStart(),
                length: element.name.getWidth(),
              })
            }
          }
        }
      }
    }

    return diagnostics
  },
}

export default serverLayer
