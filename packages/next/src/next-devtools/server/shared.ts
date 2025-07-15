import type { StackFrame } from 'stacktrace-parser'
import { codeFrameColumns } from 'next/dist/compiled/babel/code-frame'
import isInternal from '../../shared/lib/is-internal'
import { ignoreListAnonymousStackFramesIfSandwiched as ignoreListAnonymousStackFramesIfSandwichedGeneric } from '../../server/lib/source-maps'

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
  originalStackFrame: (StackFrame & { ignored: boolean }) | null
  originalCodeFrame: string | null
}

export function ignoreListAnonymousStackFramesIfSandwiched(
  responses: OriginalStackFramesResponse
): void {
  ignoreListAnonymousStackFramesIfSandwichedGeneric(
    responses,
    (response) => {
      return (
        response.status === 'fulfilled' &&
        response.value.originalStackFrame !== null &&
        response.value.originalStackFrame.file === '<anonymous>'
      )
    },
    (response) => {
      return (
        response.status === 'fulfilled' &&
        response.value.originalStackFrame !== null &&
        response.value.originalStackFrame.ignored === true
      )
    },
    (response) => {
      return response.status === 'fulfilled' &&
        response.value.originalStackFrame !== null
        ? response.value.originalStackFrame.methodName
        : ''
    },
    (response) => {
      ;(
        response as PromiseFulfilledResult<OriginalStackFrameResponse>
      ).value.originalStackFrame!.ignored = true
    }
  )
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
