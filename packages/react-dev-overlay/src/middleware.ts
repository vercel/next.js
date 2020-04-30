import { codeFrameColumns } from '@babel/code-frame'
import { promises as fs } from 'fs'
import { IncomingMessage, ServerResponse } from 'http'
import path from 'path'
import { NullableMappedPosition, SourceMapConsumer } from 'source-map'
import { StackFrame } from 'stacktrace-parser'
import url from 'url'
import webpack from 'webpack'
import { OriginalSource } from 'webpack-sources'

type OverlayMiddlewareOptions = {
  rootDirectory: string
  stats(): webpack.Stats
}

export type OriginalStackFrameResponse = {
  originalStackFrame: StackFrame
  originalCodeFrame: string | null
}

function getOverlayMiddleware(options: OverlayMiddlewareOptions) {
  function getSourceById(id: string): OriginalSource | null {
    try {
      const compilation = options.stats()?.compilation
      const m = compilation?.modules?.find(m => m.id === id)
      return (
        m?.source(
          compilation.dependencyTemplates,
          compilation.runtimeTemplate
        ) ?? null
      )
    } catch (err) {
      console.error(`Failed to lookup module by ID ("${id}"):`, err)
      return null
    }
  }

  return async function(
    req: IncomingMessage,
    res: ServerResponse,
    next: Function
  ) {
    const { pathname, query } = url.parse(req.url, true)

    if (pathname === '/__nextjs_original-stack-frame') {
      const frame = (query as unknown) as StackFrame
      if (
        frame.file?.startsWith('webpack-internal:///') ||
        !parseInt(frame.lineNumber?.toString() ?? '', 10)
      ) {
        const moduleId = frame.file.slice(20)
        const source = getSourceById(moduleId)
        if (source == null) {
          res.statusCode = 404
          res.write('Not Found')
          return res.end()
        }

        const frameLine = parseInt(frame.lineNumber?.toString() ?? '', 10)
        let frameColumn: number | null = parseInt(
          frame.column?.toString() ?? '',
          10
        )
        if (!frameColumn) {
          frameColumn = null
        }

        let pos: NullableMappedPosition
        try {
          const consumer = await new SourceMapConsumer(source.map())
          pos = consumer.originalPositionFor({
            line: frameLine,
            column: frameColumn,
          })
          consumer.destroy()
        } catch (err) {
          res.statusCode = 500
          res.write('Internal Server Error')
          return res.end()
        }

        if (pos.source == null) {
          res.statusCode = 404
          res.write('Not Found')
          return res.end()
        }

        const filePath = path.resolve(options.rootDirectory, pos.source)
        const fileContent: string | null = await fs
          .readFile(filePath, 'utf-8')
          .catch(() => null)

        const originalFrame: StackFrame = {
          file: fileContent
            ? path.relative(options.rootDirectory, filePath)
            : pos.source,
          lineNumber: pos.line,
          column: pos.column,
          methodName: frame.methodName, // TODO: resolve original method name (?)
          arguments: [],
        }

        const originalCodeFrame: string | null =
          fileContent && pos.line
            ? (codeFrameColumns(
                fileContent,
                { start: { line: pos.line, column: pos.column } },
                { forceColor: true }
              ) as string)
            : null

        const o: OriginalStackFrameResponse = {
          originalStackFrame: originalFrame,
          originalCodeFrame,
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.write(Buffer.from(JSON.stringify(o)))
        return res.end()
      }
      res.statusCode = 400
      res.write('Bad Request')
      return res.end()
    }
    return next()
  }
}

export default getOverlayMiddleware
