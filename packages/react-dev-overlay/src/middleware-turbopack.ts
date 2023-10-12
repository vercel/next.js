import type { IncomingMessage, ServerResponse } from 'http'
import type { StackFrame } from 'stacktrace-parser'

import fs from 'fs/promises'
import url from 'url'
import {
  extractSourceMapFilepath,
  findOriginalSourcePositionAndContent,
} from './utils'
import { codeFrameColumns } from '@babel/code-frame'
import type { OriginalStackFrameResponse } from './middleware'
import type { RawSourceMap } from 'source-map'

export { extractSourceMapFilepath }

export class InputError extends Error {}

export async function createOriginalStackFrame(
  frame: StackFrame
): Promise<OriginalStackFrameResponse | null> {
  const { file, lineNumber } = frame
  if (file === null) {
    throw new Error('Frame filename missing')
  }

  if (lineNumber === null) {
    throw new Error('Frame lineNumber missing')
  }

  const sourceMapFile = await extractSourceMapFilepath(file)
  if (!sourceMapFile) {
    return null
  }

  const sourceMap = JSON.parse(
    await fs.readFile(sourceMapFile, 'utf8')
  ) as RawSourceMap

  const original = await findOriginalSourcePositionAndContent(sourceMap, {
    line: lineNumber,
    column: frame.column,
  })

  if (original === null) {
    return null
  }

  const { sourcePosition, sourceContent } = original

  const originalFile = sourcePosition.source?.replace(
    /^\/turbopack\/\[project\]\//,
    ''
  )
  if (originalFile === undefined || sourceContent === null) {
    return null
  }

  return {
    originalStackFrame: {
      file: originalFile,
      lineNumber: sourcePosition.line,
      column: sourcePosition.column,
      methodName: sourcePosition.name ?? '<unknown>',
      arguments: [],
    },
    originalCodeFrame:
      sourcePosition.line == null
        ? null
        : codeFrameColumns(
            sourceContent,
            {
              start: {
                line: sourcePosition.line,
                column: sourcePosition.column ?? 0,
              },
            },
            { forceColor: true }
          ),
  }
}

export function getOverlayMiddleware(rootDirectory: string) {
  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: (error?: Error) => unknown
  ) {
    const { pathname, query } = url.parse(req.url!, true)

    if (pathname === '/__nextjs_original-stack-frame') {
      const frame = query as unknown as StackFrame & {
        errorMessage: string | undefined
      }

      const { file } = frame

      if (
        file === null ||
        file === '<anonymous>' ||
        file.match(/^node:/) ||
        // Don't read any files outside the root dir for security.
        !file.startsWith(rootDirectory)
      ) {
        res.statusCode = 400
        res.write('Bad Request')
        return res.end()
      }

      let originalStackFrame
      try {
        originalStackFrame = await createOriginalStackFrame(frame)
      } catch (e: any) {
        res.statusCode = e instanceof InputError ? 400 : 500
        res.write(e.message)
        return res.end()
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.write(Buffer.from(JSON.stringify(originalStackFrame)))
      return res.end()
    }

    return next()
  }
}
