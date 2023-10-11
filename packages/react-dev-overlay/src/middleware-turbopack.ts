import type { IncomingMessage, ServerResponse } from 'http'
import type { StackFrame } from 'stacktrace-parser'

import fs from 'fs/promises'
import url from 'url'
import path from 'path'
import { findOriginalSourcePositionAndContent } from './utils'
import { codeFrameColumns } from '@babel/code-frame'

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

      const { file, lineNumber } = frame

      if (
        lineNumber === null ||
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

      const sourceFileContents = await fs.readFile(file, 'utf8')
      const sourceMapFile = sourceFileContents.match(
        /\/\/#\s*sourceMappingURL\s*=(.*)/
      )?.[1]
      if (sourceMapFile === undefined) {
        res.statusCode = 404
        res.write('Source map file not found')
        return res.end()
      }

      let sourceMap
      try {
        sourceMap = JSON.parse(
          await fs.readFile(
            path.resolve(path.dirname(file), sourceMapFile),
            'utf8'
          )
        )
      } catch (e) {
        res.statusCode = 500
        res.write('Unable to read sourcemap file')
        return res.end()
      }

      const original = await findOriginalSourcePositionAndContent(sourceMap, {
        line: lineNumber,
        column: frame.column,
      })

      if (original === null) {
        res.statusCode = 404
        res.write('Source map symbol not found')
        return res.end()
      }

      const { sourcePosition, sourceContent } = original

      if (sourceContent === null) {
        res.statusCode = 404
        res.write('Source map symbol not found')
        return res.end()
      }

      const originalFile = sourcePosition.source?.replace(
        /^\/turbopack\/\[project\]/,
        ''
      )

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.write(
        Buffer.from(
          JSON.stringify({
            originalStackFrame: {
              file: originalFile,
              lineNumber: sourcePosition.line,
              column: sourcePosition.column,
              methodName: sourcePosition.name,
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
          })
        )
      )
      return res.end()
    }

    return next()
  }
}
