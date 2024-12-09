import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import type { OriginalStackFrameResponse } from '../../server/shared'
import {
  isWebpackInternalResource,
  formatFrameSourceFile,
} from './webpack-module-path'
export interface OriginalStackFrame extends OriginalStackFrameResponse {
  error: boolean
  reason: string | null
  external: boolean
  ignored: boolean
  sourceStackFrame: StackFrame
}

function getOriginalStackFrame(
  source: StackFrame,
  type: 'server' | 'edge-server' | null,
  isAppDir: boolean,
  errorMessage: string
): Promise<OriginalStackFrame> {
  async function _getOriginalStackFrame(): Promise<OriginalStackFrame> {
    const params = new URLSearchParams()
    params.append('isServer', String(type === 'server'))
    params.append('isEdgeServer', String(type === 'edge-server'))
    params.append('isAppDirectory', String(isAppDir))
    params.append('errorMessage', errorMessage)
    for (const key in source) {
      params.append(key, ((source as any)[key] ?? '').toString())
    }

    const controller = new AbortController()
    const tm = setTimeout(() => controller.abort(), 3000)
    const res = await self
      .fetch(
        `${
          process.env.__NEXT_ROUTER_BASEPATH || ''
        }/__nextjs_original-stack-frame?${params.toString()}`,
        { signal: controller.signal }
      )
      .finally(() => {
        clearTimeout(tm)
      })
    if (!res.ok || res.status === 204) {
      return Promise.reject(new Error(await res.text()))
    }

    const body: OriginalStackFrameResponse = await res.json()
    return {
      error: false,
      reason: null,
      external: false,
      sourceStackFrame: source,
      originalStackFrame: body.originalStackFrame,
      originalCodeFrame: body.originalCodeFrame || null,
      sourcePackage: body.sourcePackage,
      ignored: body.originalStackFrame?.ignored || false,
    }
  }

  // TODO: merge this section into ignoredList handling
  if (
    source.file === 'file://' ||
    source.file?.match(/^node:/) ||
    source.file?.match(/https?:\/\//)
  ) {
    return Promise.resolve({
      error: false,
      reason: null,
      external: true,
      sourceStackFrame: source,
      originalStackFrame: null,
      originalCodeFrame: null,
      sourcePackage: null,
      ignored: true,
    })
  }

  return _getOriginalStackFrame().catch((err: Error) => ({
    error: true,
    reason: err?.message ?? err?.toString() ?? 'Unknown Error',
    external: false,
    sourceStackFrame: source,
    originalStackFrame: null,
    originalCodeFrame: null,
    sourcePackage: null,
    ignored: false,
  }))
}

export function getOriginalStackFrames(
  frames: StackFrame[],
  type: 'server' | 'edge-server' | null,
  isAppDir: boolean,
  errorMessage: string
) {
  return Promise.all(
    frames.map((frame) =>
      getOriginalStackFrame(frame, type, isAppDir, errorMessage)
    )
  )
}

export function getFrameSource(frame: StackFrame): string {
  if (!frame.file) return ''

  const isWebpackFrame = isWebpackInternalResource(frame.file)

  let str = ''
  // Skip URL parsing for webpack internal file paths.
  if (isWebpackFrame) {
    str = formatFrameSourceFile(frame.file)
  } else {
    try {
      const u = new URL(frame.file)

      let parsedPath = ''
      // Strip the origin for same-origin scripts.
      if (globalThis.location?.origin !== u.origin) {
        // URLs can be valid without an `origin`, so long as they have a
        // `protocol`. However, `origin` is preferred.
        if (u.origin === 'null') {
          parsedPath += u.protocol
        } else {
          parsedPath += u.origin
        }
      }

      // Strip query string information as it's typically too verbose to be
      // meaningful.
      parsedPath += u.pathname
      str = formatFrameSourceFile(parsedPath)
    } catch {
      str = formatFrameSourceFile(frame.file)
    }
  }

  if (!isWebpackInternalResource(frame.file) && frame.lineNumber != null) {
    if (str) {
      if (frame.column != null) {
        str += ` (${frame.lineNumber}:${frame.column})`
      } else {
        str += ` (${frame.lineNumber})`
      }
    }
  }
  return str
}
