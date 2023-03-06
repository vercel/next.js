// This module provides intellisense for all components that has the `"use client"` directive.

import { NEXT_TS_ERRORS } from '../constant'
import { getTs, getTypeChecker } from '../utils'

const clientBoundary = {
  getSemanticDiagnosticsForExportVariableStatement(
    source: ts.SourceFile,
    node: ts.VariableStatement
  ) {
    const ts = getTs()

    const diagnostics: ts.Diagnostic[] = []

    if (ts.isVariableDeclarationList(node.declarationList)) {
      for (const declaration of node.declarationList.declarations) {
        const initializer = declaration.initializer
        if (initializer && ts.isArrowFunction(initializer)) {
          diagnostics.push(
            ...clientBoundary.getSemanticDiagnosticsForFunctionExport(
              source,
              initializer
            )
          )
        }
      }
    }

    return diagnostics
  },

  getSemanticDiagnosticsForFunctionExport(
    source: ts.SourceFile,
    node: ts.FunctionDeclaration | ts.ArrowFunction
  ) {
    const ts = getTs()
    const typeChecker = getTypeChecker()
    if (!typeChecker) return []

    const diagnostics: ts.Diagnostic[] = []

    const props = node.parameters?.[0]?.name
    if (props && ts.isObjectBindingPattern(props)) {
      for (const prop of (props as ts.ObjectBindingPattern).elements) {
        const type = typeChecker.getTypeAtLocation(prop)
        const typeDeclarationNode = type.symbol?.getDeclarations()?.[0]
        const propName = (prop.propertyName || prop.name).getText()

        if (typeDeclarationNode) {
          if (
            // Show warning for not serializable props.
            ts.isFunctionOrConstructorTypeNode(typeDeclarationNode) ||
            ts.isClassDeclaration(typeDeclarationNode)
          ) {
            diagnostics.push({
              file: source,
              category: ts.DiagnosticCategory.Warning,
              code: NEXT_TS_ERRORS.INVALID_CLIENT_ENTRY_PROP,
              messageText: `Props must be serializable for components in the "use client" entry file, "${propName}" is invalid.`,
              start: prop.getStart(),
              length: prop.getWidth(),
            })
          }
        }
      }
    }

    return diagnostics
  },
}

export default clientBoundary
