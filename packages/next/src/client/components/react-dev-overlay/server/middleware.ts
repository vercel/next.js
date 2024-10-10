import { constants as FS, promises as fs } from 'fs'
import path from 'path'
import { SourceMapConsumer } from 'next/dist/compiled/source-map08'
import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import { getRawSourceMap } from '../internal/helpers/get-raw-source-map'
import { launchEditor } from '../internal/helpers/launchEditor'
import {
  badRequest,
  findSourcePackage,
  getOriginalCodeFrame,
  internalServerError,
  json,
  noContent,
  type OriginalStackFrameResponse,
} from './shared'
import { createStackFrame } from '../internal/helpers/create-stack-frame'
export { getServerError } from '../internal/helpers/node-stack-frames'
export { parseStack } from '../internal/helpers/parse-stack'

import type { IncomingMessage, ServerResponse } from 'http'
import type webpack from 'webpack'
import type { RawSourceMap } from 'next/dist/compiled/source-map08'

type Source = {
  sourceMap: RawSourceMap
  compilation: webpack.Compilation | undefined
}

function getModuleById(
  id: string | undefined,
  compilation: webpack.Compilation
) {
  const { chunkGraph, modules } = compilation

  return [...modules].find((module) => chunkGraph.getModuleId(module) === id)
}

function findModuleNotFoundFromError(errorMessage: string | undefined) {
  return errorMessage?.match(/'([^']+)' module/)?.[1]
}

function getSourcePath(source: string) {
  return source.replace(/^(webpack:\/\/\/|webpack:\/\/|webpack:\/\/_N_E\/)/, '')
}

async function findOriginalSourcePositionAndContent(
  sourceMap: RawSourceMap,
  position: { line: number; column: number | null }
) {
  const consumer = await new SourceMapConsumer(sourceMap)
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
  sourceMap,
  moduleId,
  modulePath,
  rootDirectory,
  frame,
  errorMessage,
  compilation,
}: {
  sourceMap: RawSourceMap
  moduleId?: string
  modulePath?: string
  rootDirectory: string
  frame: StackFrame
  errorMessage?: string
  compilation?: webpack.Compilation
}): Promise<OriginalStackFrameResponse | undefined> {
  const { lineNumber, column } = frame
  const moduleNotFound = findModuleNotFoundFromError(errorMessage)
  const result = await (async () => {
    if (moduleNotFound) {
      if (!compilation) {
        return undefined
      }

      return findOriginalSourcePositionAndContentFromCompilation(
        moduleId,
        moduleNotFound,
        compilation
      )
    }
    // This returns 1-based lines and 0-based columns
    return await findOriginalSourcePositionAndContent(sourceMap, {
      line: lineNumber ?? 1,
      column,
    })
  })()

  if (!result?.sourcePosition.source) {
    return undefined
  }

  const { sourcePosition, sourceContent } = result

  const filePath = path.resolve(
    rootDirectory,
    getSourcePath(
      // When sourcePosition.source is the loader path the modulePath is generally better.
      (sourcePosition.source.includes('|')
        ? modulePath
        : sourcePosition.source) || modulePath
    )
  )

  const traced = {
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
  } satisfies StackFrame

  return {
    originalStackFrame: traced,
    originalCodeFrame: getOriginalCodeFrame(traced, sourceContent),
    sourcePackage: findSourcePackage(traced),
  }
}

export async function getSourceMapFromFile(
  filename: string
): Promise<RawSourceMap | undefined> {
  const fileContent = await fs
    .readFile(filename, 'utf-8')
    .catch(() => undefined)

  return fileContent ? getRawSourceMap(filename, fileContent) : undefined
}

export async function getSourceMapFromCompilation(
  id: string,
  compilation: webpack.Compilation
): Promise<RawSourceMap | undefined> {
  try {
    const module = getModuleById(id, compilation)

    if (!module) {
      return undefined
    }

    // @ts-expect-error The types for `CodeGenerationResults.get` require a
    // runtime to be passed as second argument, but apparently it also works
    // without it.
    const codeGenerationResult = compilation.codeGenerationResults.get(module)
    const source = codeGenerationResult?.sources.get('javascript')

    return source?.map() ?? undefined
  } catch (err) {
    console.error(`Failed to lookup module by ID ("${id}"):`, err)
    return undefined
  }
}

export async function getSource(
  filename: string,
  options: {
    distDirectory: string
    getCompilations: () => webpack.Compilation[]
  }
): Promise<Source | undefined> {
  const { distDirectory, getCompilations } = options

  if (filename.startsWith('/_next/static')) {
    filename = path.join(distDirectory, filename.replace(/^\/_next\//, ''))
  }

  if (filename.startsWith('file:') || filename.startsWith(path.sep)) {
    const sourceMap = await getSourceMapFromFile(filename)

    return sourceMap ? { sourceMap, compilation: undefined } : undefined
  }

  const moduleId: string = filename.replace(
    /^(webpack-internal:\/\/\/|file:\/\/|webpack:\/\/(_N_E\/)?)/,
    ''
  )

  for (const compilation of getCompilations()) {
    const sourceMap = await getSourceMapFromCompilation(moduleId, compilation)

    if (sourceMap) {
      return { sourceMap, compilation }
    }
  }

  return undefined
}

export function getOverlayMiddleware(options: {
  distDirectory: string
  rootDirectory: string
  clientStats: () => webpack.Stats | null
  serverStats: () => webpack.Stats | null
  edgeServerStats: () => webpack.Stats | null
}) {
  const {
    distDirectory,
    rootDirectory,
    clientStats,
    serverStats,
    edgeServerStats,
  } = options

  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const { pathname, searchParams } = new URL(`http://n${req.url}`)

    if (pathname === '/__nextjs_original-stack-frame') {
      const isServer = searchParams.get('isServer') === 'true'
      const isEdgeServer = searchParams.get('isEdgeServer') === 'true'
      const isAppDirectory = searchParams.get('isAppDirectory') === 'true'
      const frame = createStackFrame(searchParams)

      let sourcePackage = findSourcePackage(frame)

      if (
        !(
          /^(webpack-internal:\/\/\/|(file|webpack):\/\/)/.test(frame.file) &&
          frame.lineNumber
        )
      ) {
        if (sourcePackage) return json(res, { sourcePackage })
        return badRequest(res)
      }

      const moduleId: string = frame.file.replace(
        /^(webpack-internal:\/\/\/|file:\/\/|webpack:\/\/(_N_E\/)?)/,
        ''
      )
      const modulePath = frame.file.replace(
        /^(webpack-internal:\/\/\/|file:\/\/|webpack:\/\/(_N_E\/)?)(\(.*\)\/?)/,
        ''
      )

      let source: Source | undefined

      try {
        source = await getSource(frame.file, {
          distDirectory,
          getCompilations: () => {
            const compilations: webpack.Compilation[] = []

            // Try Client Compilation first. In `pages` we leverage
            // `isClientError` to check. In `app` it depends on if it's a server
            // / client component and when the code throws. E.g. during HTML
            // rendering it's the server/edge compilation.
            if ((!isEdgeServer && !isServer) || isAppDirectory) {
              const compilation = clientStats()?.compilation

              if (compilation) {
                compilations.push(compilation)
              }
            }

            // Try Server Compilation. In `pages` this could be something
            // imported in getServerSideProps/getStaticProps as the code for
            // those is tree-shaken. In `app` this finds server components and
            // code that was imported from a server component. It also covers
            // when client component code throws during HTML rendering.
            if (isServer || isAppDirectory) {
              const compilation = serverStats()?.compilation

              if (compilation) {
                compilations.push(compilation)
              }
            }

            // Try Edge Server Compilation. Both cases are the same as Server
            // Compilation, main difference is that it covers `runtime: 'edge'`
            // pages/app routes.
            if (isEdgeServer || isAppDirectory) {
              const compilation = edgeServerStats()?.compilation

              if (compilation) {
                compilations.push(compilation)
              }
            }

            return compilations
          },
        })
      } catch (err) {
        console.log('Failed to get source map:', err)
        return internalServerError(res)
      }

      if (!source) {
        if (sourcePackage) return json(res, { sourcePackage })
        return noContent(res)
      }

      try {
        const originalStackFrameResponse = await createOriginalStackFrame({
          frame,
          sourceMap: source.sourceMap,
          moduleId,
          modulePath,
          rootDirectory,
          compilation: source.compilation,
        })

        if (originalStackFrameResponse === null) {
          if (sourcePackage) return json(res, { sourcePackage })
          return noContent(res)
        }

        return json(res, originalStackFrameResponse)
      } catch (err) {
        console.log('Failed to parse source map:', err)
        return internalServerError(res)
      }
    } else if (pathname === '/__nextjs_launch-editor') {
      const frame = createStackFrame(searchParams)

      if (!frame.file) return badRequest(res)

      // frame files may start with their webpack layer, like (middleware)/middleware.js
      const filePath = path.resolve(
        rootDirectory,
        frame.file.replace(/^\([^)]+\)\//, '')
      )
      const fileExists = await fs.access(filePath, FS.F_OK).then(
        () => true,
        () => false
      )
      if (!fileExists) return noContent(res)

      try {
        await launchEditor(filePath, frame.lineNumber, frame.column ?? 1)
      } catch (err) {
        console.log('Failed to launch editor:', err)
        return internalServerError(res)
      }

      return noContent(res)
    }

    return next()
  }
}

export function getSourceMapMiddleware(options: {
  distDirectory: string
  clientStats: () => webpack.Stats | null
  serverStats: () => webpack.Stats | null
  edgeServerStats: () => webpack.Stats | null
}) {
  const { distDirectory, clientStats, serverStats, edgeServerStats } = options

  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: Function
  ) {
    const { pathname, searchParams } = new URL(`http://n${req.url}`)

    if (pathname !== '/__nextjs_source-map') {
      return next()
    }

    const filename = searchParams.get('filename')

    if (filename) {
      let source: Source | undefined

      try {
        source = await getSource(filename, {
          distDirectory,
          getCompilations: () => {
            const compilations: webpack.Compilation[] = []

            for (const stats of [
              clientStats(),
              serverStats(),
              edgeServerStats(),
            ]) {
              if (stats?.compilation) {
                compilations.push(stats.compilation)
              }
            }

            return compilations
          },
        })
      } catch (error) {
        console.log('Failed to get source map:', error)

        return internalServerError(res)
      }

      if (!source) {
        console.log('NO SOURCE MAP', filename)
        return noContent(res)
      }

      return json(res, source.sourceMap)
    }
  }
}
