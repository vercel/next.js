import { codeFrameColumns } from '@babel/code-frame'
import { constants as FS, promises as fs } from 'fs'
import { IncomingMessage, ServerResponse } from 'http'
import path from 'path'
import {
  NullableMappedPosition,
  RawSourceMap,
  SourceMapConsumer,
} from 'source-map'
import { StackFrame } from 'stacktrace-parser'
import url from 'url'
import webpack from 'webpack'
import { getRawSourceMap } from './internal/helpers/getRawSourceMap'
import { launchEditor } from './internal/helpers/launchEditor'

export type OverlayMiddlewareOptions = {
  rootDirectory: string
  stats(): webpack.Stats
}

export type OriginalStackFrameResponse = {
  originalStackFrame: StackFrame
  originalCodeFrame: string | null
}

type Source = { map: () => RawSourceMap } | null

function getOverlayMiddleware(options: OverlayMiddlewareOptions) {
  async function getSourceById(isFile: boolean, id: string): Promise<Source> {
    if (isFile) {
      const fileContent: string | null = await fs
        .readFile(id, 'utf-8')
        .catch(() => null)

      if (fileContent == null) {
        return null
      }

      const map = getRawSourceMap(fileContent)
      if (map == null) {
        return null
      }

      return {
        map() {
          return map
        },
      }
    }

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
        !(
          (frame.file?.startsWith('webpack-internal:///') ||
            frame.file?.startsWith('file://')) &&
          Boolean(parseInt(frame.lineNumber?.toString() ?? '', 10))
        )
      ) {
        res.statusCode = 400
        res.write('Bad Request')
        return res.end()
      }

      const moduleId: string = frame.file.replace(
        /^(webpack-internal:\/\/\/|file:\/\/)/,
        ''
      )

      let source: Source
      try {
        source = await getSourceById(frame.file.startsWith('file:'), moduleId)
      } catch (err) {
        console.log('Failed to get source map:', err)
        res.statusCode = 500
        res.write('Internal Server Error')
        return res.end()
      }

      if (source == null) {
        res.statusCode = 204
        res.write('No Content')
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
        console.log('Failed to parse source map:', err)
        res.statusCode = 500
        res.write('Internal Server Error')
        return res.end()
      }

      if (pos.source == null) {
        res.statusCode = 204
        res.write('No Content')
        return res.end()
      }

      const filePath = path.resolve(
        options.rootDirectory,
        pos.source.startsWith('webpack:///')
          ? pos.source.substring(11)
          : pos.source
      )
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
    } else if (pathname === '/__nextjs_launch-editor') {
      const frame = (query as unknown) as StackFrame

      const frameFile = frame.file?.toString() || null
      if (frameFile == null) {
        res.statusCode = 400
        res.write('Bad Request')
        return res.end()
      }

      const filePath = path.resolve(options.rootDirectory, frameFile)
      const fileExists = await fs.access(filePath, FS.F_OK).then(
        () => true,
        () => false
      )
      if (!fileExists) {
        res.statusCode = 204
        res.write('No Content')
        return res.end()
      }

      const frameLine = parseInt(frame.lineNumber?.toString() ?? '', 10) || 1
      const frameColumn = parseInt(frame.column?.toString() ?? '', 10) || 1

      try {
        await launchEditor(filePath, frameLine, frameColumn)
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

export default getOverlayMiddleware
