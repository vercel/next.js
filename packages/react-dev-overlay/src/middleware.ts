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
// @ts-ignore
// eslint-disable-next-line import/no-extraneous-dependencies
import webpack from 'webpack'
import { getRawSourceMap } from './internal/helpers/getRawSourceMap'
import { launchEditor } from './internal/helpers/launchEditor'

export type OverlayMiddlewareOptions = {
  isWebpack5?: boolean
  rootDirectory: string
  stats(): webpack.Stats | null
  serverStats(): webpack.Stats | null
}

export type OriginalStackFrameResponse = {
  originalStackFrame: StackFrame
  originalCodeFrame: string | null
}

type Source = { map: () => RawSourceMap } | null

function getModuleId(compilation: any, module: any, isWebpack5?: boolean) {
  if (isWebpack5) {
    return compilation.chunkGraph.getModuleId(module)
  }

  return module.id
}

function getModuleSource(
  compilation: any,
  module: any,
  isWebpack5?: boolean
): any {
  if (isWebpack5) {
    return (
      (module &&
        compilation.codeGenerationResults
          .get(module)
          ?.sources.get('javascript')) ??
      null
    )
  }

  return (
    module?.source(
      compilation.dependencyTemplates,
      compilation.runtimeTemplate
    ) ?? null
  )
}

function getSourcePath(source: string) {
  // Webpack prefixes certain source paths with this path
  if (source.startsWith('webpack:///')) {
    return source.substring(11)
  }

  // Make sure library name is filtered out as well
  if (source.startsWith('webpack://_N_E/')) {
    return source.substring(15)
  }

  if (source.startsWith('webpack://')) {
    return source.substring(10)
  }

  return source
}

async function findOriginalSourcePositionAndContent(
  webpackSource: any,
  position: { line: number; column: number | null }
) {
  const consumer = await new SourceMapConsumer(webpackSource.map())
  try {
    const sourcePosition: NullableMappedPosition = consumer.originalPositionFor(
      {
        line: position.line,
        column: position.column ?? 0,
      }
    )

    if (!sourcePosition.source) {
      return null
    }

    const sourceContent: string | null =
      consumer.sourceContentFor(
        sourcePosition.source,
        /* returnNullOnMissing */ true
      ) ?? null

    return {
      sourcePosition,
      sourceContent,
    }
  } finally {
    consumer.destroy()
  }
}

export async function createOriginalStackFrame({
  line,
  column,
  source,
  modulePath,
  rootDirectory,
  frame,
}: {
  line: number
  column: number | null
  source: any
  modulePath?: string
  rootDirectory: string
  frame: any
}): Promise<OriginalStackFrameResponse | null> {
  const result = await findOriginalSourcePositionAndContent(source, {
    line,
    column,
  })

  if (result === null) {
    return null
  }

  const { sourcePosition, sourceContent } = result

  if (!sourcePosition.source) {
    return null
  }

  const filePath = path.resolve(
    rootDirectory,
    modulePath || getSourcePath(sourcePosition.source)
  )

  const originalFrame: StackFrame = {
    file: sourceContent
      ? path.relative(rootDirectory, filePath)
      : sourcePosition.source,
    lineNumber: sourcePosition.line,
    column: sourcePosition.column,
    methodName: frame.methodName, // TODO: resolve original method name (?)
    arguments: [],
  }

  const originalCodeFrame: string | null =
    !(originalFrame.file?.includes('node_modules') ?? true) &&
    sourceContent &&
    sourcePosition.line
      ? (codeFrameColumns(
          sourceContent,
          {
            start: {
              line: sourcePosition.line,
              column: sourcePosition.column ?? 0,
            },
          },
          { forceColor: true }
        ) as string)
      : null

  return {
    originalStackFrame: originalFrame,
    originalCodeFrame,
  }
}

function getOverlayMiddleware(options: OverlayMiddlewareOptions) {
  async function getSourceById(
    isServerSide: boolean,
    isFile: boolean,
    id: string
  ): Promise<Source> {
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
      const compilation = isServerSide
        ? options.serverStats()?.compilation
        : options.stats()?.compilation
      if (compilation == null) {
        return null
      }

      const module = [...compilation.modules].find(
        (searchModule) =>
          getModuleId(compilation, searchModule, options.isWebpack5) === id
      )
      return getModuleSource(compilation, module, options.isWebpack5)
    } catch (err) {
      console.error(`Failed to lookup module by ID ("${id}"):`, err)
      return null
    }
  }

  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: Function
  ) {
    const { pathname, query } = url.parse(req.url!, true)

    if (pathname === '/__nextjs_original-stack-frame') {
      const frame = query as unknown as StackFrame & {
        isServerSide: 'true' | 'false'
      }
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

      const isServerSide = frame.isServerSide === 'true'
      const moduleId: string = frame.file.replace(
        /^(webpack-internal:\/\/\/|file:\/\/)/,
        ''
      )

      let source: Source
      try {
        source = await getSourceById(
          isServerSide,
          frame.file.startsWith('file:'),
          moduleId
        )
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

      try {
        const originalStackFrameResponse = await createOriginalStackFrame({
          line: frameLine,
          column: frameColumn,
          source,
          frame,
          modulePath: moduleId,
          rootDirectory: options.rootDirectory,
        })

        if (originalStackFrameResponse === null) {
          res.statusCode = 204
          res.write('No Content')
          return res.end()
        }

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.write(Buffer.from(JSON.stringify(originalStackFrameResponse)))
        return res.end()
      } catch (err) {
        console.log('Failed to parse source map:', err)
        res.statusCode = 500
        res.write('Internal Server Error')
        return res.end()
      }
    } else if (pathname === '/__nextjs_launch-editor') {
      const frame = query as unknown as StackFrame

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

export { getOverlayMiddleware }
