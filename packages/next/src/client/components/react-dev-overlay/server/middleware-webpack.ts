import { constants as FS, promises as fs } from 'fs'
import path from 'path'
import url from 'url'
import { SourceMapConsumer } from 'next/dist/compiled/source-map08'
import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import { getSourceMapFromFile } from '../internal/helpers/get-source-map-from-file'
import { launchEditor } from '../internal/helpers/launchEditor'
import {
  badRequest,
  getOriginalCodeFrame,
  internalServerError,
  json,
  noContent,
  type OriginalStackFrameResponse,
} from './shared'
export { getServerError } from '../internal/helpers/node-stack-frames'
export { parseStack, type StackFrame } from '../internal/helpers/parse-stack'
export { getSourceMapFromFile }

import type { IncomingMessage, ServerResponse } from 'http'
import type webpack from 'webpack'
import type {
  NullableMappedPosition,
  RawSourceMap,
} from 'next/dist/compiled/source-map08'
import { formatFrameSourceFile } from '../internal/helpers/webpack-module-path'
import type { MappedPosition } from 'source-map'

function shouldIgnorePath(modulePath: string): boolean {
  return (
    modulePath.includes('node_modules') ||
    // Only relevant for when Next.js is symlinked e.g. in the Next.js monorepo
    modulePath.includes('next/dist')
  )
}

type IgnoredSources = Array<{ url: string; ignored: boolean }>

export interface IgnorableStackFrame extends StackFrame {
  ignored: boolean
}

type SourceAttributes = {
  sourcePosition: NullableMappedPosition
  sourceContent: string | null
}

type Source =
  | {
      type: 'file'
      sourceMap: RawSourceMap
      ignoredSources: IgnoredSources
      modulePath: string
    }
  | {
      type: 'bundle'
      sourceMap: RawSourceMap
      ignoredSources: IgnoredSources
      compilation: webpack.Compilation
      moduleId: string
      modulePath: string
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
): Promise<SourceAttributes | null> {
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

export function getIgnoredSources(sourceMap: RawSourceMap): IgnoredSources {
  const ignoreList = new Set<number>()
  const moduleFilenames = sourceMap?.sources ?? []

  for (let index = 0; index < moduleFilenames.length; index++) {
    // bundlerFilePath case: webpack://./app/page.tsx
    const bundlerFilePath = moduleFilenames[index]
    // Format the path to the normal file path
    const formattedFilePath = formatFrameSourceFile(bundlerFilePath)
    if (shouldIgnorePath(formattedFilePath)) {
      ignoreList.add(index)
    }
  }

  const ignoredSources = sourceMap.sources.map((source, index) => {
    return {
      url: source,
      ignored: ignoreList.has(sourceMap.sources.indexOf(source)),
      content: sourceMap.sourcesContent?.[index] ?? null,
    }
  })
  return ignoredSources
}

function isIgnoredSource(
  source: Source,
  sourcePosition: MappedPosition | NullableMappedPosition
) {
  if (sourcePosition.source == null) {
    return true
  }
  for (const ignoredSource of source.ignoredSources) {
    if (ignoredSource.ignored && ignoredSource.url === sourcePosition.source) {
      return true
    }
  }

  return false
}

function createStackFrame(searchParams: URLSearchParams) {
  const file = searchParams.get('file') as string
  return {
    file,
    methodName: searchParams.get('methodName') as string,
    lineNumber: parseInt(searchParams.get('lineNumber') ?? '0', 10) || 0,
    column: parseInt(searchParams.get('column') ?? '0', 10) || 0,
    arguments: searchParams.getAll('arguments').filter(Boolean),
  } satisfies StackFrame
}

function findOriginalSourcePositionAndContentFromCompilation(
  moduleId: string | undefined,
  importedModule: string,
  compilation: webpack.Compilation
): SourceAttributes | null {
  const module = getModuleById(moduleId, compilation)
  return module?.buildInfo?.importLocByPath?.get(importedModule) ?? null
}

export async function createOriginalStackFrame({
  source,
  rootDirectory,
  frame,
  errorMessage,
}: {
  source: Source
  rootDirectory: string
  frame: StackFrame
  errorMessage?: string
}): Promise<OriginalStackFrameResponse | null> {
  const { lineNumber, column } = frame
  const moduleNotFound = findModuleNotFoundFromError(errorMessage)
  const result = await (async () => {
    if (moduleNotFound) {
      if (source.type === 'file') {
        return undefined
      }

      return findOriginalSourcePositionAndContentFromCompilation(
        source.moduleId,
        moduleNotFound,
        source.compilation
      )
    }
    // This returns 1-based lines and 0-based columns
    return await findOriginalSourcePositionAndContent(source.sourceMap, {
      line: lineNumber ?? 1,
      column,
    })
  })()

  if (!result) {
    return null
  }
  const { sourcePosition, sourceContent } = result

  if (!sourcePosition.source) {
    return null
  }

  const ignored =
    isIgnoredSource(source, sourcePosition) ||
    // If the source file is externals, should be excluded even it's not ignored source.
    // e.g. webpack://next/dist/.. needs to be ignored
    shouldIgnorePath(source.modulePath)

  const sourcePath = getSourcePath(
    // When sourcePosition.source is the loader path the modulePath is generally better.
    (sourcePosition.source!.includes('|')
      ? source.modulePath
      : sourcePosition.source) || source.modulePath
  )
  const filePath = path.resolve(rootDirectory, sourcePath)

  const resolvedFilePath = sourceContent
    ? path.relative(rootDirectory, filePath)
    : sourcePosition.source

  const traced: IgnorableStackFrame = {
    file: resolvedFilePath,
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
    ignored,
  }

  return {
    originalStackFrame: traced,
    originalCodeFrame: getOriginalCodeFrame(traced, sourceContent),
  }
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

async function getSource(
  filename: string,
  options: {
    getCompilations: () => webpack.Compilation[]
  }
): Promise<Source | undefined> {
  const { getCompilations } = options

  if (path.isAbsolute(filename)) {
    filename = url.pathToFileURL(filename).href
  }

  if (filename.startsWith('file:')) {
    const sourceMap = await getSourceMapFromFile(filename)
    return sourceMap
      ? {
          type: 'file',
          sourceMap,
          ignoredSources: getIgnoredSources(sourceMap),
          modulePath: filename.replace(/^file:\/\//, ''),
        }
      : undefined
  }

  // webpack-internal:///./src/hello.tsx => ./src/hello.tsx
  // rsc://React/Server/webpack-internal:///(rsc)/./src/hello.tsx?42 => (rsc)/./src/hello.tsx
  // webpack://_N_E/./src/hello.tsx => ./src/hello.tsx
  const moduleId = filename
    .replace(
      /^(rsc:\/\/React\/[^/]+\/)?(webpack-internal:\/\/\/|webpack:\/\/(_N_E\/)?)/,
      ''
    )
    .replace(/\?\d+$/, '')

  // (rsc)/./src/hello.tsx => ./src/hello.tsx
  const modulePath = moduleId.replace(/^(\(.*\)\/?)/, '')

  for (const compilation of getCompilations()) {
    const sourceMap = await getSourceMapFromCompilation(moduleId, compilation)
    const ignoreList = []
    const moduleFilenames = sourceMap?.sources ?? []

    for (let index = 0; index < moduleFilenames.length; index++) {
      // bundlerFilePath case: webpack://./app/page.tsx
      const bundlerFilePath = moduleFilenames[index]
      // Format the path to the normal file path
      const formattedFilePath = formatFrameSourceFile(bundlerFilePath)
      if (shouldIgnorePath(formattedFilePath)) {
        ignoreList.push(index)
      }
    }

    if (sourceMap) {
      const ignoredSources = getIgnoredSources(sourceMap)
      return {
        type: 'bundle',
        sourceMap,
        compilation,
        moduleId,
        modulePath,
        ignoredSources,
      }
    }
  }

  return undefined
}

export function getOverlayMiddleware(options: {
  rootDirectory: string
  clientStats: () => webpack.Stats | null
  serverStats: () => webpack.Stats | null
  edgeServerStats: () => webpack.Stats | null
}) {
  const { rootDirectory, clientStats, serverStats, edgeServerStats } = options

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

      let source: Source | undefined
      try {
        source = await getSource(frame.file, {
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
        console.error('Failed to get source map:', err)
        return internalServerError(res)
      }

      // This stack frame is used for the one that couldn't locate the source or source mapped frame
      const defaultStackFrame: IgnorableStackFrame = {
        file: frame.file,
        lineNumber: frame.lineNumber,
        column: frame.column ?? 1,
        methodName: frame.methodName,
        ignored: shouldIgnorePath(frame.file),
        arguments: [],
      }
      if (!source) {
        // return original stack frame with no source map
        return json(res, {
          originalStackFrame: defaultStackFrame,
          originalCodeFrame: null,
        })
      }

      try {
        const originalStackFrameResponse = await createOriginalStackFrame({
          frame,
          source,
          rootDirectory,
        })

        if (!originalStackFrameResponse) {
          return json(res, {
            originalStackFrame: defaultStackFrame,
            originalCodeFrame: null,
          })
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
  clientStats: () => webpack.Stats | null
  serverStats: () => webpack.Stats | null
  edgeServerStats: () => webpack.Stats | null
}) {
  const { clientStats, serverStats, edgeServerStats } = options

  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const { pathname, searchParams } = new URL(`http://n${req.url}`)

    if (pathname !== '/__nextjs_source-map') {
      return next()
    }

    const filename = searchParams.get('filename')

    if (!filename) {
      return badRequest(res)
    }

    let source: Source | undefined

    try {
      source = await getSource(filename, {
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
      console.error('Failed to get source map:', error)

      return internalServerError(res)
    }

    if (!source) {
      return noContent(res)
    }

    return json(res, source.sourceMap)
  }
}
