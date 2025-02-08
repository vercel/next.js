// This module provides intellisense for all exports from `"use server"` directive.

import { NEXT_TS_ERRORS } from '../constant'
import type tsModule from 'typescript/lib/tsserverlibrary'
import type { TSNextPlugin } from '../TSNextPlugin'
import { isPromiseType } from '../utils'

export const serverBoundary = (tsNextPlugin: TSNextPlugin) => ({
  isFunctionReturningPromise(
    node: tsModule.Node,
    typeChecker: tsModule.TypeChecker
  ) {
    const type = typeChecker.getTypeAtLocation(node)
    const signatures = typeChecker.getSignaturesOfType(
      type,
      tsNextPlugin.ts.SignatureKind.Call
    )

    let isPromise = true
    if (signatures.length) {
      for (const signature of signatures) {
        const returnType = signature.getReturnType()
        if (returnType.isUnion()) {
          for (const t of returnType.types) {
            if (!isPromiseType(t, typeChecker)) {
              isPromise = false
              break
            }
          }
        } else {
          isPromise = isPromiseType(returnType, typeChecker)
        }
      }
    } else {
      isPromise = false
    }

    return isPromise
  },
  getSemanticDiagnosticsForExportDeclaration(
    source: tsModule.SourceFile,
    node: tsModule.ExportDeclaration
  ) {
    const typeChecker = tsNextPlugin.getTypeChecker()
    if (!typeChecker) return []

    const diagnostics: tsModule.Diagnostic[] = []

    const exportClause = node.exportClause
    if (
      !node.isTypeOnly &&
      exportClause &&
      tsNextPlugin.ts.isNamedExports(exportClause)
    ) {
      for (const e of exportClause.elements) {
        if (e.isTypeOnly) {
          continue
        }
        if (!this.isFunctionReturningPromise(e, typeChecker)) {
          diagnostics.push({
            file: source,
            category: tsNextPlugin.ts.DiagnosticCategory.Error,
            code: NEXT_TS_ERRORS.INVALID_SERVER_ENTRY_RETURN,
            messageText: `The "use server" file can only export async functions.`,
            start: e.getStart(),
            length: e.getWidth(),
          })
        }
      }
    }

    return diagnostics
  },

  getSemanticDiagnosticsForExportVariableStatement(
    source: tsModule.SourceFile,
    node: tsModule.VariableStatement
  ) {
    const diagnostics: tsModule.Diagnostic[] = []

    if (tsNextPlugin.ts.isVariableDeclarationList(node.declarationList)) {
      for (const declaration of node.declarationList.declarations) {
        const initializer = declaration.initializer
        if (
          initializer &&
          (tsNextPlugin.ts.isArrowFunction(initializer) ||
            tsNextPlugin.ts.isFunctionDeclaration(initializer) ||
            tsNextPlugin.ts.isFunctionExpression(initializer) ||
            tsNextPlugin.ts.isCallExpression(initializer) ||
            tsNextPlugin.ts.isIdentifier(initializer))
        ) {
          diagnostics.push(
            ...this.getSemanticDiagnosticsForFunctionExport(
              source,
              initializer
            )
          )
        } else {
          diagnostics.push({
            file: source,
            category: tsNextPlugin.ts.DiagnosticCategory.Error,
            code: NEXT_TS_ERRORS.INVALID_SERVER_ENTRY_RETURN,
            messageText: `The "use server" file can only export async functions.`,
            start: declaration.getStart(),
            length: declaration.getWidth(),
          })
        }
      }
    }

    return diagnostics
  },

  getSemanticDiagnosticsForFunctionExport(
    source: tsModule.SourceFile,
    node:
      | tsModule.FunctionDeclaration
      | tsModule.ArrowFunction
      | tsModule.FunctionExpression
      | tsModule.CallExpression
      | tsModule.Identifier
  ) {
    const typeChecker = tsNextPlugin.getTypeChecker()
    if (!typeChecker) return []

    const diagnostics: tsModule.Diagnostic[] = []

    if (!this.isFunctionReturningPromise(node, typeChecker)) {
      diagnostics.push({
        file: source,
        category: tsNextPlugin.ts.DiagnosticCategory.Error,
        code: NEXT_TS_ERRORS.INVALID_SERVER_ENTRY_RETURN,
        messageText: `The "use server" file can only export async functions. Add "async" to the function declaration or return a Promise.`,
        start: node.getStart(),
        length: node.getWidth(),
      })
    }

    return diagnostics
  },
})
