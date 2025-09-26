// This module provides intellisense for all exports from `"use server"` directive.

import { NEXT_TS_ERRORS } from '../constant'
import { getTs, getTypeChecker } from '../utils'
import type tsModule from 'typescript/lib/tsserverlibrary'

// Check if the type is `Promise<T>`.
function isPromiseType(type: tsModule.Type, typeChecker: tsModule.TypeChecker) {
  const typeReferenceType = type as tsModule.TypeReference
  if (!typeReferenceType.target) return false

  // target should be Promise or Promise<...>
  if (
    !/^Promise(<.+>)?$/.test(typeChecker.typeToString(typeReferenceType.target))
  ) {
    return false
  }

  return true
}

function isFunctionReturningPromise(
  node: tsModule.Node,
  typeChecker: tsModule.TypeChecker,
  ts: typeof tsModule
) {
  const type = typeChecker.getTypeAtLocation(node)
  const signatures = typeChecker.getSignaturesOfType(
    type,
    ts.SignatureKind.Call
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
}

const serverBoundary = {
  getSemanticDiagnosticsForExportDeclaration(
    source: tsModule.SourceFile,
    node: tsModule.ExportDeclaration
  ) {
    const ts = getTs()
    const typeChecker = getTypeChecker()
    if (!typeChecker) return []

    const diagnostics: tsModule.Diagnostic[] = []

    const exportClause = node.exportClause
    if (!node.isTypeOnly && exportClause && ts.isNamedExports(exportClause)) {
      for (const e of exportClause.elements) {
        if (e.isTypeOnly) {
          continue
        }
        if (!isFunctionReturningPromise(e, typeChecker, ts)) {
          diagnostics.push({
            file: source,
            category: ts.DiagnosticCategory.Error,
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
    const ts = getTs()

    const diagnostics: tsModule.Diagnostic[] = []

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
            ...serverBoundary.getSemanticDiagnosticsForFunctionExport(
              source,
              initializer
            )
          )
        } else {
          diagnostics.push({
            file: source,
            category: ts.DiagnosticCategory.Error,
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
    const ts = getTs()
    const typeChecker = getTypeChecker()
    if (!typeChecker) return []

    const diagnostics: tsModule.Diagnostic[] = []

    if (!isFunctionReturningPromise(node, typeChecker, ts)) {
      diagnostics.push({
        file: source,
        category: ts.DiagnosticCategory.Error,
        code: NEXT_TS_ERRORS.INVALID_SERVER_ENTRY_RETURN,
        messageText: `The "use server" file can only export async functions. Add "async" to the function declaration or return a Promise.`,
        start: node.getStart(),
        length: node.getWidth(),
      })
    }

    return diagnostics
  },
}

export default serverBoundary
