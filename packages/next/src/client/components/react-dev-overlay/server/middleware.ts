import { codeFrameColumns } from 'next/dist/compiled/babel/code-frame'
import { constants as FS, promises as fs } from 'fs'
import type { IncomingMessage, ServerResponse } from 'http'
import path from 'path'
import { SourceMapConsumer } from 'next/dist/compiled/source-map08'
import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import url from 'url'
import type webpack from 'webpack'
import { getRawSourceMap } from '../internal/helpers/getRawSourceMap'
import { launchEditor } from '../internal/helpers/launchEditor'
import { findSourcePackage, type OriginalStackFrameResponse } from './shared'
export { getServerError } from '../internal/helpers/nodeStackFrames'
export { parseStack } from '../internal/helpers/parseStack'

export type OverlayMiddlewareOptions = {
  rootDirectory: string
  stats(): webpack.Stats | null
  serverStats(): webpack.Stats | null
  edgeServerStats(): webpack.Stats | null
}

type Source = { map: () => any } | null

function getModuleId(compilation: any, module: any) {
  return compilation.chunkGraph.getModuleId(module)
}

function getModuleById(
  id: string | undefined,
  compilation: webpack.Compilation
) {
  return [...compilation.modules].find((searchModule) => {
    const moduleId = getModuleId(compilation, searchModule)
    return moduleId === id
  })
}

function findModuleNotFoundFromError(errorMessage: string | undefined) {
  const match = errorMessage?.match(/'([^']+)' module/)
  return match && match[1]
}

function getModuleSource(compilation: any, module: any): any {
  return (
    (module &&
      compilation.codeGenerationResults
        .get(module)
        ?.sources.get('javascript')) ??
    null
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
    const sourcePosition = consumer.originalPositionFor({
      line: position.line,
      column: position.column ?? 0,
    })

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

function findOriginalSourcePositionAndContentFromCompilation(
  moduleId: string | undefined,
  importedModule: string,
  compilation: webpack.Compilation
) {
  const module = getModuleById(moduleId, compilation)
  return module?.buildInfo?.importLocByPath?.get(importedModule) ?? null
}

export async function createOriginalStackFrame({
  line,
  column,
  source,
  moduleId,
  modulePath,
  rootDirectory,
  frame,
  errorMessage,
  clientCompilation,
  serverCompilation,
  edgeCompilation,
}: {
  line: number
  column: number | null
  source: any
  moduleId?: string
  modulePath?: string
  rootDirectory: string
  frame: any
  errorMessage?: string
  clientCompilation?: webpack.Compilation
  serverCompilation?: webpack.Compilation
  edgeCompilation?: webpack.Compilation
}): Promise<OriginalStackFrameResponse | null> {
  const moduleNotFound = findModuleNotFoundFromError(errorMessage)
  const result = await (async () => {
    if (moduleNotFound) {
      let moduleNotFoundResult = null

      if (clientCompilation) {
        moduleNotFoundResult =
          findOriginalSourcePositionAndContentFromCompilation(
            moduleId,
            moduleNotFound,
            clientCompilation
          )
      }

      if (moduleNotFoundResult === null && serverCompilation) {
        moduleNotFoundResult =
          findOriginalSourcePositionAndContentFromCompilation(
            moduleId,
            moduleNotFound,
            serverCompilation
          )
      }

      if (moduleNotFoundResult === null && edgeCompilation) {
        moduleNotFoundResult =
          findOriginalSourcePositionAndContentFromCompilation(
            moduleId,
            moduleNotFound,
            edgeCompilation
          )
      }

      return moduleNotFoundResult
    }
    // This returns 1-based lines and 0-based columns
    return await findOriginalSourcePositionAndContent(source, {
      line,
      column,
    })
  })()

  if (result === null) {
    return null
  }

  const { sourcePosition, sourceContent } = result

  if (!sourcePosition.source) {
    return null
  }

  const filePath = path.resolve(
    rootDirectory,
    getSourcePath(
      // When sourcePosition.source is the loader path the modulePath is generally better.
      (sourcePosition.source.includes('|')
        ? modulePath
        : sourcePosition.source) || modulePath
    )
  )

  const originalFrame: StackFrame = {
    file: sourceContent
      ? path.relative(rootDirectory, filePath)
      : sourcePosition.source,
    lineNumber: sourcePosition.line,
    column: (sourcePosition.column ?? 0) + 1,
    methodName:
      sourcePosition.name ||
      // default is not a valid identifier in JS so webpack uses a custom variable when it's an unnamed default export
      // Resolve it back to `default` for the method name if the source position didn't have the method.
      frame.methodName
        ?.replace('__WEBPACK_DEFAULT_EXPORT__', 'default')
        ?.replace('__webpack_exports__.', ''),
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
              column: (sourcePosition.column ?? 0) + 1,
            },
          },
          { forceColor: true }
        ) as string)
      : null

  return {
    originalStackFrame: originalFrame,
    originalCodeFrame,
    sourcePackage: findSourcePackage(filePath) ?? null,
  }
}

export async function getSourceById(
  isFile: boolean,
  id: string,
  compilation?: webpack.Compilation
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
    if (!compilation) {
      return null
    }

    const module = getModuleById(id, compilation)
    const moduleSource = getModuleSource(compilation, module)
    return moduleSource
  } catch (err) {
    console.error(`Failed to lookup module by ID ("${id}"):`, err)
    return null
  }
}

function getOverlayMiddleware(options: OverlayMiddlewareOptions) {
  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: Function
  ) {
    const { pathname, query } = url.parse(req.url!, true)

    if (pathname === '/__nextjs_original-stack-frame') {
      const frame = query as unknown as StackFrame & {
        isEdgeServer: 'true' | 'false'
        isServer: 'true' | 'false'
        isAppDirectory: 'true' | 'false'
        errorMessage: string | undefined
      }
      const isAppDirectory = frame.isAppDirectory === 'true'
      const isServerError = frame.isServer === 'true'
      const isEdgeServerError = frame.isEdgeServer === 'true'
      const isClientError = !isServerError && !isEdgeServerError

      let sourcePackage = findSourcePackage(frame.file)

      if (
        !(
          (frame.file?.startsWith('webpack-internal:///') ||
            frame.file?.startsWith('file://') ||
            frame.file?.startsWith('webpack://')) &&
          Boolean(parseInt(frame.lineNumber?.toString() ?? '', 10))
        )
      ) {
        if (sourcePackage) {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.write(Buffer.from(JSON.stringify({ sourcePackage })))
          return res.end()
        }
        res.statusCode = 400
        res.write('Bad Request')
        return res.end()
      }

      const moduleId: string = frame.file.replace(
        /^(webpack-internal:\/\/\/|file:\/\/|webpack:\/\/(_N_E\/)?)/,
        ''
      )
      const modulePath = frame.file.replace(
        /^(webpack-internal:\/\/\/|file:\/\/|webpack:\/\/(_N_E\/)?)(\(.*\)\/?)/,
        ''
      )

      let source: Source = null

      const clientCompilation = options.stats()?.compilation
      const serverCompilation = options.serverStats()?.compilation
      const edgeCompilation = options.edgeServerStats()?.compilation
      const isFile = frame.file.startsWith('file:')

      try {
        if (isClientError || isAppDirectory) {
          // Try Client Compilation first
          // In `pages` we leverage `isClientError` to check
          // In `app` it depends on if it's a server / client component and when the code throws. E.g. during HTML rendering it's the server/edge compilation.
          source = await getSourceById(isFile, moduleId, clientCompilation)
        }
        // Try Server Compilation
        // In `pages` this could be something imported in getServerSideProps/getStaticProps as the code for those is tree-shaken.
        // In `app` this finds server components and code that was imported from a server component. It also covers when client component code throws during HTML rendering.
        if ((isServerError || isAppDirectory) && source === null) {
          source = await getSourceById(isFile, moduleId, serverCompilation)
        }
        // Try Edge Server Compilation
        // Both cases are the same as Server Compilation, main difference is that it covers `runtime: 'edge'` pages/app routes.
        if ((isEdgeServerError || isAppDirectory) && source === null) {
          source = await getSourceById(isFile, moduleId, edgeCompilation)
        }
      } catch (err) {
        console.log('Failed to get source map:', err)
        res.statusCode = 500
        res.write('Internal Server Error')
        return res.end()
      }

      if (source == null) {
        if (sourcePackage) {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.write(Buffer.from(JSON.stringify({ sourcePackage })))
          return res.end()
        }
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
          moduleId,
          modulePath,
          rootDirectory: options.rootDirectory,
          errorMessage: frame.errorMessage,
          clientCompilation: isClientError ? clientCompilation : undefined,
          serverCompilation: isServerError ? serverCompilation : undefined,
          edgeCompilation: isEdgeServerError ? edgeCompilation : undefined,
        })

        if (originalStackFrameResponse === null) {
          if (sourcePackage) {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.write(Buffer.from(JSON.stringify({ sourcePackage })))
            return res.end()
          }
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

      // frame files may start with their webpack layer, like (middleware)/middleware.js
      const filePath = path.resolve(
        options.rootDirectory,
        frameFile.replace(/^\([^)]+\)\//, '')
      )
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
