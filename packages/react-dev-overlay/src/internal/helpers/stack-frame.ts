import { StackFrame } from 'stacktrace-parser'
import { OriginalStackFrameResponse } from '../../middleware'

export type OriginalStackFrame =
  | {
      error: true
      reason: string
      sourceStackFrame: StackFrame
      originalStackFrame: null
      originalCodeFrame: null
    }
  | {
      error: false
      reason: null
      sourceStackFrame: StackFrame
      originalStackFrame: StackFrame
      originalCodeFrame: string | null
    }

export function getOriginalStackFrame(
  source: StackFrame
): Promise<OriginalStackFrame> {
  async function _getOriginalStackFrame(): Promise<OriginalStackFrame> {
    const params = new URLSearchParams()
    for (const key in source) {
      params.append(key, (source[key] ?? '').toString())
    }

    const controller = new AbortController()
    const tm = setTimeout(() => controller.abort(), 3000)
    const res = await self
      .fetch(`/__nextjs_original-stack-frame?${params.toString()}`, {
        signal: controller.signal,
      })
      .finally(() => {
        clearTimeout(tm)
      })
    if (!res.ok) {
      return Promise.reject(new Error(await res.text()))
    }

    const body: OriginalStackFrameResponse = await res.json()
    return {
      error: false,
      reason: null,
      sourceStackFrame: source,
      originalStackFrame: body.originalStackFrame,
      originalCodeFrame: body.originalCodeFrame || null,
    }
  }

  return _getOriginalStackFrame().catch((err: Error) => ({
    error: true,
    reason: err?.message ?? err?.toString() ?? 'Unknown Error',
    sourceStackFrame: source,
    originalStackFrame: null,
    originalCodeFrame: null,
  }))
}

export function createOriginalStackFrame(
  source: StackFrame,
  file: string | null,
  lineNumber: number | null,
  column: number | null
): StackFrame {
  const o = { ...source }
  if (file) {
    o.file = file
    o.lineNumber = lineNumber
    o.column = column
  }
  return o
}

export function getFrameSource(frame: StackFrame): string {
  let str = ''
  try {
    const u = new URL(frame.file)

    // Strip the origin for same-origin scripts.
    if (
      typeof globalThis !== 'undefined' &&
      globalThis.location?.origin !== u.origin
    ) {
      str += u.origin
    }

    // Strip query string information as it's typically too verbose to be
    // meaningful.
    str += u.pathname
    str += ' '
  } catch {
    str += (frame.file || '(unknown)') + ' '
  }

  if (frame.lineNumber != null) {
    if (frame.column != null) {
      str += `(${frame.lineNumber}:${frame.column}) `
    } else {
      str += `(${frame.lineNumber}) `
    }
  }
  return str.slice(0, -1)
}
