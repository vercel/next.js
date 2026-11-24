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

  const line = frame.line1
  const imported =
    showJsxImport && !frame.ignored
      ? getJsxImportLocation(source, line, frame.column1)
      : undefined

  // Expand the normal source window to include the import. The JSX usage
  // remains the only marked location.
  const above = 2
  const below = 3
  const codeFrame = codeFrameColumns(
    source,
    { start: { line, column: frame.column1 ?? undefined } },
    {
      color: colors,
      maxWidth,
      linesAbove: imported ? Math.max(above, line - imported.startLine) : above,
      linesBelow: imported ? Math.max(below, imported.endLine - line) : below,
    }
  )
  if (!codeFrame || !imported) return codeFrame ?? null

  // For distant imports, omit the intervening rows instead of printing most
  // of the file. Keep the renderer's original line numbers and highlighting.
  const precedes = imported.endLine < line
  const gap = precedes
    ? line - above - imported.endLine - 1
    : imported.startLine - line - below - 1
  if (gap <= 3) return codeFrame

  const rows = codeFrame.split('\n')
  const importHeight = imported.endLine - imported.startLine + 1
  rows.splice(
    precedes ? importHeight : rows.length - importHeight - gap,
    gap,
    '    …'
  )
  return rows.join('\n')
}
