
import { NEXT_TS_ERRORS } from '../constant'
import type { TSNextPlugin } from '../TSNextPlugin'
import type tsModule from 'typescript/lib/tsserverlibrary'

// This module provides intellisense for all components that have the `"use client"` directive.
export const error = (tsNextPlugin: TSNextPlugin) => ({
  getSemanticDiagnostics(
    source: tsModule.SourceFile,
    isClientEntry: boolean
  ): tsModule.Diagnostic[] {
    const isErrorFile = /[\\/]error\.tsx?$/.test(source.fileName)
    const isGlobalErrorFile = /[\\/]global-error\.tsx?$/.test(source.fileName)

    if (!isErrorFile && !isGlobalErrorFile) return []
    if (!isClientEntry) {
      // Error components must be Client components
      return [
        {
          file: source,
          category: tsNextPlugin.ts.DiagnosticCategory.Error,
          code: NEXT_TS_ERRORS.INVALID_ERROR_COMPONENT,
          messageText: `Error Components must be Client Components, please add the "use client" directive: https://nextjs.org/docs/app/api-reference/file-conventions/error`,
          start: 0,
          length: source.text.length,
        },
      ]
    }
    return []
  },
})
