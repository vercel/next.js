import type {
  OriginalStackFrameResponse,
  OriginalStackFrameResponseResult,
  OriginalStackFramesRequest,
  StackFrame,
} from '../server/shared'
import {
  isWebpackInternalResource,
  formatFrameSourceFile,
} from './webpack-module-path'

export type { StackFrame }

interface ResolvedOriginalStackFrame extends OriginalStackFrameResponse {
  error: false
  reason: null
  external: boolean
  ignored: boolean
  sourceStackFrame: StackFrame
}

interface RejectedOriginalStackFrame extends OriginalStackFrameResponse {
  error: true
  reason: string
  external: boolean
  ignored: boolean
  sourceStackFrame: StackFrame
}

export type OriginalStackFrame =
  | ResolvedOriginalStackFrame
  | RejectedOriginalStackFrame

function getOriginalStackFrame(
  source: StackFrame,
  response: OriginalStackFrameResponseResult
): Promise<OriginalStackFrame> {
  async function _getOriginalStackFrame(): Promise<ResolvedOriginalStackFrame> {
    if (response.status === 'rejected') {
      throw new Error(response.reason)
    }

    const body: OriginalStackFrameResponse = response.value

    return {
      error: false,
      reason: null,
      external: false,
      sourceStackFrame: source,
      originalStackFrame: body.originalStackFrame,
      originalCodeFrame: body.originalCodeFrame || null,
      ignored: body.originalStackFrame?.ignored || false,
    }
  }

  // TODO: merge this section into ignoredList handling
  if (source.file === 'file://' || source.file?.match(/https?:\/\//)) {
    return Promise.resolve({
      error: false,
      reason: null,
      external: true,
      sourceStackFrame: source,
      originalStackFrame: null,
      originalCodeFrame: null,
      ignored: true,
    })
  }

  return _getOriginalStackFrame().catch(
    (err: Error): RejectedOriginalStackFrame => ({
      error: true,
      reason: err?.message ?? err?.toString() ?? 'Unknown Error',
      external: false,
      sourceStackFrame: source,
      originalStackFrame: null,
      originalCodeFrame: null,
      ignored: false,
    })
  )
}

export async function getOriginalStackFrames(
  frames: readonly StackFrame[],
  type: 'server' | 'edge-server' | null,
  isAppDir: boolean
): Promise<readonly OriginalStackFrame[]> {
  const req: OriginalStackFramesRequest = {
    frames,
    isServer: type === 'server',
    isEdgeServer: type === 'edge-server',
    isAppDirectory: isAppDir,
  }

  let res: Response | undefined = undefined
  let reason: string | undefined = undefined
  try {
    res = await fetch('/__nextjs_original-stack-frames', {
      method: 'POST',
      body: JSON.stringify(req),
    })
  } catch (e) {
    reason = e + ''
  }

  // When fails to fetch the original stack frames, we reject here to be
  // caught at `_getOriginalStackFrame()` and return the stack frames so
  // that the error overlay can render.
  if (res && res.ok && res.status !== 204) {
    const data = await res.json()
    return Promise.all(
      frames.map((frame, index) => getOriginalStackFrame(frame, data[index]))
    )
  } else {
    if (res) {
      reason = await res.text()
    }
  }
  return Promise.all(
    frames.map((frame) =>
      getOriginalStackFrame(frame, {
        status: 'rejected',
        reason: `Failed to fetch the original stack frames ${reason ? `: ${reason}` : ''}`,
      })
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

  if (!isWebpackInternalResource(frame.file) && frame.line1 != null) {
    // We don't need line and column numbers for anonymous sources because
    // there's no entrypoint for the location anyway.
    if (str && frame.file !== '<anonymous>') {
      if (frame.column1 != null) {
        str += ` (${frame.line1}:${frame.column1})`
      } else {
        str += ` (${frame.line1})`
      }
    }
  }
  return str
}
