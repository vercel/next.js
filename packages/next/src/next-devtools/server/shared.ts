import { codeFrameColumns } from '../../shared/lib/errors/code-frame'
import type { StackFrame } from '../../server/lib/parse-stack'
import { ignoreListAnonymousStackFramesIfSandwiched as ignoreListAnonymousStackFramesIfSandwichedGeneric } from '../../server/lib/source-maps'

export type { StackFrame }

export interface IgnorableStackFrame extends StackFrame {
  ignored: boolean
}

export interface OriginalStackFramesRequest {
  frames: readonly StackFrame[]
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
  frame: IgnorableStackFrame,
  source: string | null,
  colors: boolean = process.stdout.isTTY
): string | null {
  if (!source || frame.line1 == null) {
    return null
  }

  return (
    codeFrameColumns(
      source,
      {
        start: {
          line: frame.line1,
          column: frame.column1 ?? undefined,
        },
      },
      { color: colors }
    ) ?? null
  )
}
