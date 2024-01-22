import type { IncomingMessage, ServerResponse } from 'http'
import type { ParsedUrlQuery } from 'querystring'
import type { OriginalStackFrameResponse } from './middleware'

import fs, { constants as FS } from 'fs/promises'
import url from 'url'
// @ts-ignore Package exists
import { codeFrameColumns } from 'next/dist/compiled/babel/code-frame'
import { launchEditor } from './internal/helpers/launchEditor'

interface Project {
  getSourceForAsset(filePath: string): Promise<string | null>
  traceSource(
    stackFrame: TurbopackStackFrame
  ): Promise<TurbopackStackFrame | null>
}

interface TurbopackStackFrame {
  column: number | null
  file: string
  isServer: boolean
  line: number
  methodName: string | null
}

const currentSourcesByFile: Map<string, Promise<string | null>> = new Map()
async function batchedTraceSource(
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
  if (!sourceFrame.file.includes('node_modules')) {
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
    return null
  }

  return {
    originalStackFrame: traced.frame,
    originalCodeFrame:
      traced.source === null || traced.frame.file.includes('node_modules')
        ? null
        : codeFrameColumns(
            traced.source,
            {
              start: {
                line: traced.frame.lineNumber,
                column: traced.frame.column ?? 0,
              },
            },
            { forceColor: true }
          ),
  }
}

function stackFrameFromQuery(query: ParsedUrlQuery): TurbopackStackFrame {
  return {
    file: query.file as string,
    methodName: query.methodName as string,
    line:
      typeof query.lineNumber === 'string' ? parseInt(query.lineNumber, 10) : 0,
    column:
      typeof query.column === 'string' ? parseInt(query.column, 10) : null,
    isServer: query.isServer === 'true',
  }
}

export function getOverlayMiddleware(project: Project) {
  return async function (req: IncomingMessage, res: ServerResponse) {
    const { pathname, query } = url.parse(req.url!, true)
    if (pathname === '/__nextjs_original-stack-frame') {
      const frame = stackFrameFromQuery(query)
      let originalStackFrame
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
      const frame = stackFrameFromQuery(query)

      const filePath = frame.file?.toString()
      if (filePath === undefined) {
        res.statusCode = 400
        res.write('Bad Request')
        res.end()
        return
      }

      const fileExists = await fs.access(filePath, FS.F_OK).then(
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
        launchEditor(filePath, frame.line, frame.column ?? 1)
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
