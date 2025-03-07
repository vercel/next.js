import {
  DISALLOWED_SERVER_REACT_APIS,
  DISALLOWED_SERVER_REACT_DOM_APIS,
  NEXT_TS_ERRORS,
} from '../constant'
import ts from 'typescript'

export const server = {
  /** This will remove completions disallowed react APIs for server components */
  filterCompletionsAtPosition(entries: ts.CompletionEntry[]) {
    return entries.filter((e: ts.CompletionEntry) => {
      if (
        DISALLOWED_SERVER_REACT_APIS.includes(e.name) &&
        e.source === 'react'
      ) {
        return false
      }
      return true
    })
  },

  /** Filter out quick info for some React APIs. */
  hasDisallowedReactAPIDefinition(definitions: readonly ts.DefinitionInfo[]) {
    return definitions?.some(
      (d) =>
        DISALLOWED_SERVER_REACT_APIS.includes(d.name) &&
        d.containerName === 'React'
    )
  },

  /** Give errors about disallowed imports. */
  getSemanticDiagnosticsForImportDeclaration(
    source: ts.SourceFile,
    node: ts.ImportDeclaration
  ) {
    const diagnostics: ts.Diagnostic[] = []

    const importPath = node.moduleSpecifier.getText(source!)
    const importClause = node.importClause
    const namedBindings = importClause?.namedBindings

    if (importClause) {
      if (/^['"]react['"]$/.test(importPath)) {
        // Check if it imports "useState"
        if (namedBindings && ts.isNamedImports(namedBindings)) {
          const elements = namedBindings.elements
          for (const element of elements) {
            const name = element.name.getText(source!)
            if (DISALLOWED_SERVER_REACT_APIS.includes(name)) {
              diagnostics.push({
                ...NEXT_TS_ERRORS.INVALID_SERVER_API(name),
                file: source,
                start: element.name.getStart(),
                length: element.name.getWidth(),
              })
            }
          }
        }
      } else if (/^['"]react-dom['"]$/.test(importPath)) {
        // Check if it imports "useFormState"
        if (namedBindings && ts.isNamedImports(namedBindings)) {
          const elements = namedBindings.elements
          for (const element of elements) {
            const name = element.name.getText(source!)
            if (DISALLOWED_SERVER_REACT_DOM_APIS.includes(name)) {
              diagnostics.push({
                ...NEXT_TS_ERRORS.INVALID_SERVER_API(name),
                file: source,
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
