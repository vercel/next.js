import type { IncomingMessage, ServerResponse } from 'http'
import type { StackFrame } from 'stacktrace-parser'

import fs, { constants as FS } from 'fs/promises'
import url from 'url'
import {
  extractSourceMapFilepath,
  findOriginalSourcePositionAndContent,
} from './utils'
import { codeFrameColumns } from '@babel/code-frame'
import TTLCache from '@isaacs/ttlcache'
import type { OriginalStackFrameResponse } from './middleware'
import type { RawSourceMap } from 'source-map'
import { launchEditor } from './internal/helpers/launchEditor'
import { ParsedUrlQuery } from 'querystring'

export { extractSourceMapFilepath }

export class InputError extends Error {}

const mapCache: TTLCache<string, any> = new TTLCache({ ttl: 3000 })

export async function createOriginalStackFrame(
  rootDirectory: string,
  frame: StackFrame
): Promise<OriginalStackFrameResponse | null> {
  const { lineNumber } = frame
  const file = frame.file?.replace(/^(file:\/\/)/, '')
  if (file === undefined || file === '<anonymous>' || file.match(/^node:/)) {
    throw new InputError('Frame filename missing or invalid')
  }

  if (
    // Don't read any files outside the root dir for security.
    !file.startsWith(rootDirectory)
  ) {
    throw new InputError('Attempted to read outside rootDirectory')
  }

  if (lineNumber === null) {
    throw new InputError('Frame lineNumber missing')
  }

  let sourceMap
  const existing = mapCache.get(file)
  if (existing) {
    sourceMap = existing
  } else {
    const sourceMapFile = await extractSourceMapFilepath(file)
    sourceMap =
      sourceMapFile !== undefined
        ? (JSON.parse(await fs.readFile(sourceMapFile, 'utf8')) as RawSourceMap)
        : undefined
    mapCache.set(file, sourceMap)
  }

  if (!sourceMap) {
    return {
      originalStackFrame: frame,
      originalCodeFrame: null,
    }
  }

  const original = await findOriginalSourcePositionAndContent(sourceMap, {
    line: lineNumber,
    column: frame.column,
  })

  if (original === null) {
    return {
      originalStackFrame: frame,
      originalCodeFrame: null,
    }
  }

  const { sourcePosition, sourceContent } = original

  const originalFile = sourcePosition.source?.replace(
    /^\/turbopack\/\[project\]\//,
    ''
  )
  if (originalFile === undefined || sourceContent === null) {
    return {
      originalStackFrame: frame,
      originalCodeFrame: null,
    }
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

function stackFrameFromQuery(query: ParsedUrlQuery): StackFrame {
  return {
    file: query.file as string,
    methodName: query.methodName as string,
    arguments: query.arguments as string[],
    lineNumber:
      typeof query.lineNumber === 'string'
        ? parseInt(query.lineNumber, 10)
        : null,
    column:
      typeof query.column === 'string' ? parseInt(query.column, 10) : null,
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
      const frame = stackFrameFromQuery(query)
      let originalStackFrame
      try {
        originalStackFrame = await createOriginalStackFrame(
          rootDirectory,
          frame
        )
      } catch (e: any) {
        res.statusCode = e instanceof InputError ? 400 : 500
        res.write(e.message)
        return res.end()
      }

      if (originalStackFrame === null) {
        res.statusCode = 404
        res.write('Unable to resolve sourcemap')
        return res.end()
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.write(Buffer.from(JSON.stringify(originalStackFrame)))
      return res.end()
    } else if (pathname === '/__nextjs_launch-editor') {
      const frame = stackFrameFromQuery(query)

      const filePath = frame.file?.toString()
      if (filePath === undefined) {
        res.statusCode = 400
        res.write('Bad Request')
        return res.end()
      }

      const fileExists = await fs.access(filePath, FS.F_OK).then(
        () => true,
        () => false
      )
      if (!fileExists) {
        res.statusCode = 204
        res.write('No Content')
        return res.end()
      }

      try {
        launchEditor(filePath, frame.lineNumber ?? 1, frame.column ?? 1)
      } catch (err) {
        console.log('Failed to launch editor:', err)
        res.statusCode = 500
        res.write('Internal Server Error')
        return res.end()
      }

      res.statusCode = 204
      return res.end()
    }

    return next()
  }
}
