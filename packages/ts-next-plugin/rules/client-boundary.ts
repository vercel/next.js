import { NEXT_TS_ERRORS } from '../constant'
import type { TSNextPlugin } from '../TSNextPlugin'
import ts from 'typescript'

// This module provides intellisense for all components that have the `"use client"` directive.
export const clientBoundary = (tsNextPlugin: TSNextPlugin) => ({
  getSemanticDiagnosticsForExportVariableStatement(
    source: ts.SourceFile,
    node: ts.VariableStatement
  ) {
    const diagnostics: ts.Diagnostic[] = []

    if (ts.isVariableDeclarationList(node.declarationList)) {
      for (const declaration of node.declarationList.declarations) {
        const initializer = declaration.initializer
        if (initializer && ts.isArrowFunction(initializer)) {
          diagnostics.push(
            ...clientBoundary(
              tsNextPlugin
            ).getSemanticDiagnosticsForFunctionExport(source, initializer)
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
    const typeChecker = tsNextPlugin.getTypeChecker()
    if (!typeChecker) return []

    const diagnostics: ts.Diagnostic[] = []

    const isErrorFile = /[\\/]error\.tsx?$/.test(source.fileName)
    const isGlobalErrorFile = /[\\/]global-error\.tsx?$/.test(source.fileName)

    const props = node.parameters?.[0]?.name
    if (props && ts.isObjectBindingPattern(props)) {
      for (const prop of (props as ts.ObjectBindingPattern).elements) {
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
                ...NEXT_TS_ERRORS.INVALID_CLIENT_ENTRY_PROP_NOT_SERVER_ACTION(
                  propName
                ),
                file: source,
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
              ...NEXT_TS_ERRORS.INVALID_CLIENT_ENTRY_PROP_NOT_SERIALIZABLE(
                propName
              ),
              file: source,
              start: prop.getStart(),
              length: prop.getWidth(),
            })
          }
        }
      }
    }

    return diagnostics
  },
})
