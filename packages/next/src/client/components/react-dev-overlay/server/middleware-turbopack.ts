import type { IncomingMessage, ServerResponse } from 'http'
import { findSourcePackage, type OriginalStackFrameResponse } from './shared'

import fs, { constants as FS } from 'fs/promises'
import { codeFrameColumns } from 'next/dist/compiled/babel/code-frame'
import { launchEditor } from '../internal/helpers/launchEditor'

interface Project {
  getSourceForAsset(filePath: string): Promise<string | null>
  traceSource(
    stackFrame: TurbopackStackFrame
  ): Promise<TurbopackStackFrame | null>
}

interface TurbopackStackFrame {
  // 1-based
  column: number | null
  // 1-based
  file: string
  isServer: boolean
  line: number | null
  methodName: string | null
  isInternal?: boolean
}

const currentSourcesByFile: Map<string, Promise<string | null>> = new Map()
export async function batchedTraceSource(
  project: Project,
  frame: TurbopackStackFrame
) {
  const file = frame.file ? decodeURIComponent(frame.file) : undefined
  if (!file) {
    return
  }

  const sourceFrame = await project.traceSource(frame)

  if (!sourceFrame) {
    return
  }

  let source
  // Don't show code frames for node_modules. These can also often be large bundled files.
  if (!sourceFrame.file.includes('node_modules') && !sourceFrame.isInternal) {
    let sourcePromise = currentSourcesByFile.get(sourceFrame.file)
    if (!sourcePromise) {
      sourcePromise = project.getSourceForAsset(sourceFrame.file)
      currentSourcesByFile.set(sourceFrame.file, sourcePromise)
      setTimeout(() => {
        // Cache file reads for 100ms, as frames will often reference the same
        // files and can be large.
        currentSourcesByFile.delete(sourceFrame.file)
      }, 100)
    }

    source = await sourcePromise
  }

  return {
    frame: {
      file: sourceFrame.file,
      lineNumber: sourceFrame.line,
      column: sourceFrame.column,
      methodName: sourceFrame.methodName ?? frame.methodName ?? '<unknown>',
      arguments: [],
    },
    source: source ?? null,
  }
}

export async function createOriginalStackFrame(
  project: Project,
  frame: TurbopackStackFrame
): Promise<OriginalStackFrameResponse | null> {
  const traced = await batchedTraceSource(project, frame)
  if (!traced) {
    const sourcePackage = findSourcePackage(frame.file)
    if (sourcePackage) return { sourcePackage }
    return null
  }

  return {
    originalStackFrame: traced.frame,
    originalCodeFrame:
      traced.source === null
        ? null
        : codeFrameColumns(
            traced.source,
            {
              start: {
                // 1-based, but -1 means start line without highlighting
                line: traced.frame.lineNumber ?? -1,
                // 1-based, but 0 means whole line without column highlighting
                column: traced.frame.column ?? 0,
              },
            },
            { forceColor: true }
          ),
    sourcePackage: findSourcePackage(traced.frame.file),
  }
}

export function getOverlayMiddleware(project: Project) {
  return async function (req: IncomingMessage, res: ServerResponse) {
    const { pathname, searchParams } = new URL(req.url!, 'http://n')

    const frame = {
      file: searchParams.get('file') as string,
      methodName: searchParams.get('methodName'),
      line: parseInt(searchParams.get('lineNumber') ?? '0', 10) || 0,
      column: parseInt(searchParams.get('column') ?? '0', 10) || 0,
      isServer: searchParams.get('isServer') === 'true',
    } satisfies TurbopackStackFrame

    if (pathname === '/__nextjs_original-stack-frame') {
      let originalStackFrame: OriginalStackFrameResponse | null
      try {
        originalStackFrame = await createOriginalStackFrame(project, frame)
      } catch (e: any) {
        res.statusCode = 500
        res.write(e.message)
        res.end()
        return
      }

      if (originalStackFrame === null) {
        res.statusCode = 404
        res.write('Unable to resolve sourcemap')
        res.end()
        return
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.write(Buffer.from(JSON.stringify(originalStackFrame)))
      res.end()
      return
    } else if (pathname === '/__nextjs_launch-editor') {
      if (!frame.file) {
        res.statusCode = 400
        res.write('Bad Request')
        res.end()
        return
      }

      const fileExists = await fs.access(frame.file, FS.F_OK).then(
        () => true,
        () => false
      )
      if (!fileExists) {
        res.statusCode = 204
        res.write('No Content')
        res.end()
        return
      }

      try {
        launchEditor(frame.file, frame.line ?? 1, frame.column ?? 1)
      } catch (err) {
        console.log('Failed to launch editor:', err)
        res.statusCode = 500
        res.write('Internal Server Error')
        res.end()
        return
      }

      res.statusCode = 204
      res.end()
    }
  }
}
