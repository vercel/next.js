import { NEXT_TS_ERRORS } from '../constant'
import type ts from 'typescript'

/**
 * This rule affects Next.js `Error` and `GlobalError` components.
 * see: https://nextjs.org/docs/app/api-reference/file-conventions/error
 */
export const errorComponents = {
  getSemanticDiagnostics(
    source: ts.SourceFile,
    isClientEntry: boolean
  ): ts.Diagnostic[] {
    // if it already has the 'use client' directive, then all is good
    if (isClientEntry) return []

    const isErrorFile = /[\\/]error\.tsx?$/.test(source.fileName)
    const isGlobalErrorFile = /[\\/]global-error\.tsx?$/.test(source.fileName)
    // if it's not an error file, then all is good
    if (!isErrorFile && !isGlobalErrorFile) return []

    // Error components must be Client components
    return [
      {
        ...NEXT_TS_ERRORS.INVALID_ERROR_COMPONENT(isGlobalErrorFile),
        file: source,
        start: 0,
        length: source.text.length,
      },
    ]
  },
}
