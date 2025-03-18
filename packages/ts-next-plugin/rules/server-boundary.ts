// This module provides intellisense for all exports from `"use server"` directive.

import { NEXT_TS_ERRORS } from '../constant'
import ts from 'typescript'
import type { TSNextPlugin } from '../TSNextPlugin'
import { isFunctionReturningPromise } from '../utils'

export const serverBoundary = (tsNextPlugin: TSNextPlugin) => ({
  getSemanticDiagnosticsForExportDeclaration(
    source: ts.SourceFile,
    node: ts.ExportDeclaration
  ) {
    const typeChecker = tsNextPlugin.getTypeChecker()
    if (!typeChecker) {
      return []
    }

    const diagnostics: ts.Diagnostic[] = []

    const exportClause = node.exportClause
    if (!node.isTypeOnly && exportClause && ts.isNamedExports(exportClause)) {
      for (const e of exportClause.elements) {
        if (e.isTypeOnly) {
          continue
        }
        if (!isFunctionReturningPromise(e, typeChecker)) {
          diagnostics.push({
            ...NEXT_TS_ERRORS.INVALID_SERVER_ENTRY_RETURN({
              isAlreadyAFunction: false,
            }),
            file: source,
            start: e.getStart(),
            length: e.getWidth(),
          })
        }
      }
    }

    return diagnostics
  },

  getSemanticDiagnosticsForExportVariableStatement(
    source: ts.SourceFile,
    node: ts.VariableStatement
  ) {
    const diagnostics: ts.Diagnostic[] = []

    if (ts.isVariableDeclarationList(node.declarationList)) {
      for (const declaration of node.declarationList.declarations) {
        const initializer = declaration.initializer
        if (
          initializer &&
          (ts.isArrowFunction(initializer) ||
            ts.isFunctionDeclaration(initializer) ||
            ts.isFunctionExpression(initializer) ||
            ts.isCallExpression(initializer) ||
            ts.isIdentifier(initializer))
        ) {
          diagnostics.push(
            ...this.getSemanticDiagnosticsForFunctionExport(source, initializer)
          )
        } else {
          diagnostics.push({
            ...NEXT_TS_ERRORS.INVALID_SERVER_ENTRY_RETURN({
              isAlreadyAFunction: false,
            }),
            file: source,
            start: declaration.getStart(),
            length: declaration.getWidth(),
          })
        }
      }
    }

    return diagnostics
  },

  getSemanticDiagnosticsForFunctionExport(
    source: ts.SourceFile,
    node:
      | ts.FunctionDeclaration
      | ts.ArrowFunction
      | ts.FunctionExpression
      | ts.CallExpression
      | ts.Identifier
  ) {
    const typeChecker = tsNextPlugin.getTypeChecker()
    if (!typeChecker) {
      return []
    }

    const diagnostics: ts.Diagnostic[] = []

    if (!isFunctionReturningPromise(node, typeChecker)) {
      diagnostics.push({
        ...NEXT_TS_ERRORS.INVALID_SERVER_ENTRY_RETURN({
          isAlreadyAFunction: true,
        }),
        file: source,
        start: node.getStart(),
        length: node.getWidth(),
      })
    }

    return diagnostics
  },
})
