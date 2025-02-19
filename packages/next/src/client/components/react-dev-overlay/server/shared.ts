import type { StackFrame } from 'stacktrace-parser'
import { codeFrameColumns } from 'next/dist/compiled/babel/code-frame'
import isInternal, {
  nextInternalsRe,
  reactNodeModulesRe,
  reactVendoredRe,
} from '../../../../shared/lib/is-internal'

export type SourcePackage = 'react' | 'next'

export interface OriginalStackFramesRequest {
  frames: StackFrame[]
  isServer: boolean
  isEdgeServer: boolean
  isAppDirectory: boolean
}

export type OriginalStackFramesResponse = OriginalStackFrameResponseResult[]

export type OriginalStackFrameResponseResult =
  PromiseSettledResult<OriginalStackFrameResponse>

export interface OriginalStackFrameResponse {
  originalStackFrame?: (StackFrame & { ignored: boolean }) | null
  originalCodeFrame?: string | null
  /** We use this to group frames in the error overlay */
  sourcePackage?: SourcePackage | null
}

const nextMethodRe = /(^__webpack_.*|node_modules[\\/]next[\\/])/

/** Given a frame, it parses which package it belongs to. */
export function findSourcePackage({
  file,
  methodName,
}: Partial<{ file: string | null; methodName: string | null }>):
  | SourcePackage
  | undefined {
  if (file) {
    // matching React first since vendored would match under `next` too
    if (reactVendoredRe.test(file) || reactNodeModulesRe.test(file)) {
      return 'react'
    } else if (nextInternalsRe.test(file)) {
      return 'next'
    } else if (file.startsWith('[turbopack]/')) {
      return 'next'
    }
  }

  if (methodName) {
    if (nextMethodRe.test(methodName)) {
      return 'next'
    }
  }
}

/**
 * It looks up the code frame of the traced source.
 * @note It ignores Next.js/React internals, as these can often be huge bundled files.
 */
export function getOriginalCodeFrame(
  frame: StackFrame,
  source: string | null,
  colors: boolean = process.stdout.isTTY
): string | null {
  if (!source || isInternal(frame.file)) {
    return null
  }

  return codeFrameColumns(
    source,
    {
      start: {
        // 1-based, but -1 means start line without highlighting
        line: frame.lineNumber ?? -1,
        // 1-based, but 0 means whole line without column highlighting
        column: frame.column ?? 0,
      },
    },
    { forceColor: colors }
  )
}
