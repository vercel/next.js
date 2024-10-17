// This module provides intellisense for all components that has the `"use client"` directive.

import { NEXT_TS_ERRORS } from '../constant'
import { getTs, getTypeChecker } from '../utils'
import type tsModule from 'typescript/lib/tsserverlibrary'

const clientBoundary = {
  getSemanticDiagnosticsForExportVariableStatement(
    source: tsModule.SourceFile,
    node: tsModule.VariableStatement
  ) {
    const ts = getTs()

    const diagnostics: tsModule.Diagnostic[] = []

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
    source: tsModule.SourceFile,
    node: tsModule.FunctionDeclaration | tsModule.ArrowFunction
  ) {
    const ts = getTs()
    const typeChecker = getTypeChecker()
    if (!typeChecker) return []

    const diagnostics: tsModule.Diagnostic[] = []

    const isErrorFile = /[\\/]error\.tsx?$/.test(source.fileName)
    const isGlobalErrorFile = /[\\/]global-error\.tsx?$/.test(source.fileName)

    const props = node.parameters?.[0]?.name
    if (props && ts.isObjectBindingPattern(props)) {
      for (const prop of (props as tsModule.ObjectBindingPattern).elements) {
        const type = typeChecker.getTypeAtLocation(prop)
        const typeDeclarationNode = type.symbol?.getDeclarations()?.[0]
        const propName = (prop.propertyName || prop.name).getText()

        if (typeDeclarationNode) {
          if (ts.isFunctionTypeNode(typeDeclarationNode)) {
            // By convention, props named "action" can accept functions since we
            // assume these are Server Actions. Structurally, there's no
            // difference between a Server Action and a normal function until
            // TypeScript exposes directives in the type of a function. This
            // will miss accidentally passing normal functions but a false
            // negative is better than a false positive given how frequent the
            // false-positive would be.
            const maybeServerAction =
              propName === 'action' || /.+Action$/.test(propName)

            // There's a special case for the error file that the `reset` prop
            // is allowed to be a function:
            // https://github.com/vercel/next.js/issues/46573
            const isErrorReset =
              (isErrorFile || isGlobalErrorFile) && propName === 'reset'

            if (!maybeServerAction && !isErrorReset) {
              diagnostics.push({
                file: source,
                category: ts.DiagnosticCategory.Warning,
                code: NEXT_TS_ERRORS.INVALID_CLIENT_ENTRY_PROP,
                messageText:
                  `Props must be serializable for components in the "use client" entry file. ` +
                  `"${propName}" is a function that's not a Server Action. ` +
                  `Rename "${propName}" either to "action" or have its name end with "Action" e.g. "${propName}Action" to indicate it is a Server Action.`,
                start: prop.getStart(),
                length: prop.getWidth(),
              })
            }
          } else if (
            // Show warning for not serializable props.
            ts.isConstructorTypeNode(typeDeclarationNode) ||
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
