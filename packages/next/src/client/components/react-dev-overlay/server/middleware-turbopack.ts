import type { IncomingMessage, ServerResponse } from 'http'
import {
  badRequest,
  findSourcePackage,
  getOriginalCodeFrame,
  internalServerError,
  json,
  noContent,
  type OriginalStackFrameResponse,
} from './shared'

import fs, { constants as FS } from 'fs/promises'
import { launchEditor } from '../internal/helpers/launchEditor'
import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import type { Project, TurbopackStackFrame } from '../../../../build/swc/types'

const currentSourcesByFile: Map<string, Promise<string | null>> = new Map()
export async function batchedTraceSource(
  project: Project,
  frame: TurbopackStackFrame
): Promise<{ frame: StackFrame; source: string | null } | undefined> {
  const file = frame.file ? decodeURIComponent(frame.file) : undefined
  if (!file) return

  const sourceFrame = await project.traceSource(frame)
  if (!sourceFrame) return

  let source = null
  // Don't look up source for node_modules or internals. These can often be large bundled files.
  if (
    sourceFrame.file &&
    !(sourceFrame.file.includes('node_modules') || sourceFrame.isInternal)
  ) {
    let sourcePromise = currentSourcesByFile.get(sourceFrame.file)
    if (!sourcePromise) {
      sourcePromise = project.getSourceForAsset(sourceFrame.file)
      currentSourcesByFile.set(sourceFrame.file, sourcePromise)
      setTimeout(() => {
        // Cache file reads for 100ms, as frames will often reference the same
        // files and can be large.
        currentSourcesByFile.delete(sourceFrame.file!)
      }, 100)
    }

    source = await sourcePromise
  }

  return {
    frame: {
      file: sourceFrame.file,
      lineNumber: sourceFrame.line ?? 0,
      column: sourceFrame.column ?? 0,
      methodName: sourceFrame.methodName ?? frame.methodName ?? '<unknown>',
      arguments: [],
    },
    source,
  }
}

export async function createOriginalStackFrame(
  project: Project,
  frame: TurbopackStackFrame
): Promise<OriginalStackFrameResponse | null> {
  const traced = await batchedTraceSource(project, frame)
  if (!traced) {
    const sourcePackage = findSourcePackage(frame)
    if (sourcePackage) return { sourcePackage }
    return null
  }

  return {
    originalStackFrame: traced.frame,
    originalCodeFrame: getOriginalCodeFrame(traced.frame, traced.source),
    sourcePackage: findSourcePackage(traced.frame),
  }
}

export function getOverlayMiddleware(project: Project) {
  return async function (req: IncomingMessage, res: ServerResponse) {
    const { pathname, searchParams } = new URL(req.url!, 'http://n')

    const frame = {
      file: searchParams.get('file') as string,
      methodName: searchParams.get('methodName') ?? '<unknown>',
      line: parseInt(searchParams.get('lineNumber') ?? '0', 10) || 0,
      column: parseInt(searchParams.get('column') ?? '0', 10) || 0,
      isServer: searchParams.get('isServer') === 'true',
    } satisfies TurbopackStackFrame

    if (pathname === '/__nextjs_original-stack-frame') {
      let originalStackFrame: OriginalStackFrameResponse | null
      try {
        originalStackFrame = await createOriginalStackFrame(project, frame)
      } catch (e: any) {
        return internalServerError(res, e.message)
      }

      if (!originalStackFrame) {
        res.statusCode = 404
        return res.end('Unable to resolve sourcemap')
      }

      return json(res, originalStackFrame)
    } else if (pathname === '/__nextjs_launch-editor') {
      if (!frame.file) return badRequest(res)

      const fileExists = await fs.access(frame.file, FS.F_OK).then(
        () => true,
        () => false
      )
      if (!fileExists) return noContent(res)

      try {
        launchEditor(frame.file, frame.line ?? 1, frame.column ?? 1)
      } catch (err) {
        console.log('Failed to launch editor:', err)
        return internalServerError(res)
      }

      noContent(res)
    }
  }
}
