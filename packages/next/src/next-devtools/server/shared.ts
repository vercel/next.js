import { codeFrameColumns } from '../../shared/lib/errors/code-frame'
import { getJsxImportLocation } from './jsx-import-location'
import { stdoutIsTerminal } from '../../lib/picocolors'
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
  showJsxImport?: boolean
}

export type OriginalStackFramesResponse = OriginalStackFrameResponseResult[]

export type OriginalStackFrameResponseResult =
  PromiseSettledResult<OriginalStackFrameResponse>

export interface OriginalStackFrameResponse {
  originalStackFrame: (StackFrame & { ignored: boolean }) | null
  originalCodeFrame: string | null
}

export type CodeFrameRenderOptions = {
  showJsxImport?: boolean
  /** Defaults to the terminal settings. The overlay opts into wide, colored frames. */
  colors?: boolean
  maxWidth?: number
}

export const DEVTOOLS_CODE_FRAME_MAX_WIDTH = 1000

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
  {
    colors = stdoutIsTerminal,
    maxWidth,
    showJsxImport,
  }: CodeFrameRenderOptions = {}
): string | null {
  if (!source || frame.line1 == null) {
    return null
  }

  const options = { color: colors, maxWidth }
  const codeFrame = codeFrameColumns(
    source,
    { start: { line: frame.line1, column: frame.column1 ?? undefined } },
    options
  )
  if (!codeFrame || frame.ignored || !showJsxImport) return codeFrame ?? null

  const imported = getJsxImportLocation(source, frame.line1, frame.column1)
  // The default frame already shows two lines above and three below.
  if (
    !imported ||
    (imported.line >= frame.line1 - 2 && imported.line <= frame.line1 + 3)
  ) {
    return codeFrame
  }
  const importFrame = codeFrameColumns(
    source,
    { start: imported },
    {
      ...options,
      linesAbove: 0,
      linesBelow: 0,
    }
  )
  return importFrame
    ? `${codeFrame}\n\nImported here:\n${importFrame}`
    : codeFrame
}
