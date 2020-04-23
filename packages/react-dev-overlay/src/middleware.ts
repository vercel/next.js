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

export default function getOverlayMiddleware(
  options: OverlayMiddlewareOptions
) {
  function getSourceById(id: string): OriginalSource | null {
    const m = options.stats()?.compilation?.modules?.find(m => m.id === id)
    return m?.originalSource() ?? null
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

        res.statusCode = 200
        res.setHeader('Content-Type', 'application.json')
        res.write(
          Buffer.from(
            JSON.stringify({
              fileName: path.relative(
                options.rootDirectory,
                path.resolve(options.rootDirectory, pos.source)
              ),
              lineNumber: pos.line,
              columnNumber: pos.column,
            })
          )
        )
        return res.end()
      }
    }
    return next()
  }
}
