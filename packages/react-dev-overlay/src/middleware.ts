import { codeFrameColumns } from '@babel/code-frame'
import { promises as fs } from 'fs'
import { IncomingMessage, ServerResponse } from 'http'
import path from 'path'
import { SourceMapConsumer } from 'source-map'
import url from 'url'
import webpack from 'webpack'
import { OriginalSource } from 'webpack-sources'

type OverlayMiddlewareOptions = {
  rootDirectory: string
  stats(): webpack.Stats
}

function getOverlayMiddleware(options: OverlayMiddlewareOptions) {
  function getSourceById(id: string): OriginalSource | null {
    const compilation = options.stats()?.compilation
    const m = compilation?.modules?.find(m => m.id === id)
    return (
      m?.source(compilation.dependencyTemplates, compilation.runtimeTemplate) ??
      null
    )
  }

  return async function(
    req: IncomingMessage,
    res: ServerResponse,
    next: Function
  ) {
    const { pathname, query } = url.parse(req.url, true)

    if (pathname === '/__nextjs_resolve-stack-frame') {
      const fileName = query.fileName as string,
        lineNumber = Number(query.lineNumber),
        columnNumber = Number(query.columnNumber)

      if (fileName?.startsWith('webpack-internal:///')) {
        const id = fileName.slice(20)

        const source = getSourceById(id)
        const consumer = await new SourceMapConsumer(source.map())
        const pos = consumer.originalPositionFor({
          line: lineNumber,
          column: columnNumber,
        })
        consumer.destroy()

        const filePath = path.resolve(options.rootDirectory, pos.source)
        const fileLine = pos.line,
          fileColumn = pos.column

        const fileContent: string | null = await fs
          .readFile(filePath, 'utf-8')
          .catch(() => null)

        const originalCodeFrame = fileContent
          ? (codeFrameColumns(
              fileContent,
              { start: { line: fileLine, column: fileColumn } },
              { forceColor: true }
            ) as string)
          : null

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.write(
          Buffer.from(
            JSON.stringify({
              fileName: path.relative(options.rootDirectory, filePath),
              lineNumber: fileLine,
              columnNumber: fileColumn,
              originalCodeFrame,
            })
          )
        )
        return res.end()
      }
    }
    return next()
  }
}

export default getOverlayMiddleware
