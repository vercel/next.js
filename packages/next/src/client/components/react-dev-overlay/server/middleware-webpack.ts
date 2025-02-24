import { constants as FS, promises as fs } from 'fs'
import { findSourceMap, type SourceMap } from 'module'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import {
  SourceMapConsumer,
  type BasicSourceMapConsumer,
} from 'next/dist/compiled/source-map08'
import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import { getSourceMapFromFile } from '../utils/get-source-map-from-file'
import { launchEditor } from '../utils/launch-editor'
import {
  getOriginalCodeFrame,
  type OriginalStackFrameResponse,
  type OriginalStackFramesRequest,
  type OriginalStackFramesResponse,
} from './shared'
import { middlewareResponse } from './middleware-response'
export { getServerError } from '../utils/node-stack-frames'
export { parseStack } from '../utils/parse-stack'
export { getSourceMapFromFile }

import type { IncomingMessage, ServerResponse } from 'http'
import type webpack from 'webpack'
import type {
  NullableMappedPosition,
  RawSourceMap,
} from 'next/dist/compiled/source-map08'
import { formatFrameSourceFile } from '../utils/webpack-module-path'
import type { MappedPosition } from 'source-map'
import { inspect } from 'util'

function shouldIgnoreSource(sourceURL: string): boolean {
  return (
    sourceURL.includes('node_modules') ||
    // Only relevant for when Next.js is symlinked e.g. in the Next.js monorepo
    sourceURL.includes('next/dist') ||
    sourceURL.startsWith('node:')
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
      moduleURL: string
    }
  | {
      type: 'bundle'
      sourceMap: RawSourceMap
      ignoredSources: IgnoredSources
      compilation: webpack.Compilation
      moduleId: string
      moduleURL: string
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
  if (source.startsWith('file://')) {
    return fileURLToPath(source)
  }
  return source.replace(/^(webpack:\/\/\/|webpack:\/\/|webpack:\/\/_N_E\/)/, '')
}

/**
 * @returns 1-based lines and 0-based columns
 */
async function findOriginalSourcePositionAndContent(
  sourceMap: RawSourceMap,
  position: { lineNumber: number | null; column: number | null }
): Promise<SourceAttributes | null> {
  let consumer: BasicSourceMapConsumer
  try {
    consumer = await new SourceMapConsumer(sourceMap)
  } catch (cause) {
    throw new Error(
      `${sourceMap.file}: Invalid source map. Only conformant source maps can be used to find the original code.`,
      { cause }
    )
  }

  try {
    const sourcePosition = consumer.originalPositionFor({
      line: position.lineNumber ?? 1,
      // 0-based columns out requires 0-based columns in.
      column: (position.column ?? 1) - 1,
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

export function getIgnoredSources(
  sourceMap: RawSourceMap & { ignoreList?: number[] }
): IgnoredSources {
  const ignoreList = new Set<number>(sourceMap.ignoreList ?? [])
  const moduleFilenames = sourceMap?.sources ?? []

  for (let index = 0; index < moduleFilenames.length; index++) {
    // bundlerFilePath case: webpack://./app/page.tsx
    const webpackSourceURL = moduleFilenames[index]
    // Format the path to the normal file path
    const formattedFilePath = formatFrameSourceFile(webpackSourceURL)
    if (shouldIgnoreSource(formattedFilePath)) {
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
  const moduleNotFound = findModuleNotFoundFromError(errorMessage)
  const result = await (() => {
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
    return findOriginalSourcePositionAndContent(source.sourceMap, frame)
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
    shouldIgnoreSource(source.moduleURL)

  const sourcePath = getSourcePath(
    // When sourcePosition.source is the loader path the modulePath is generally better.
    (sourcePosition.source!.includes('|')
      ? source.moduleURL
      : sourcePosition.source) || source.moduleURL
  )
  const filePath = path.resolve(rootDirectory, sourcePath)
  const resolvedFilePath = path.relative(rootDirectory, filePath)

  const traced: IgnorableStackFrame = {
    file: resolvedFilePath,
    lineNumber: sourcePosition.line,
    column: (sourcePosition.column ?? 0) + 1,
    methodName:
      // We ignore the sourcemapped name since it won't be the correct name.
      // The callsite will point to the column of the variable name instead of the
      // name of the enclosing function.
      // TODO(NDX-531): Spy on prepareStackTrace to get the enclosing line number for method name mapping.
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

async function getSourceMapFromCompilation(
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
  sourceURL: string,
  options: {
    getCompilations: () => webpack.Compilation[]
  }
): Promise<Source | undefined> {
  const { getCompilations } = options

  let nativeSourceMap: SourceMap | undefined
  try {
    nativeSourceMap = findSourceMap(sourceURL)
  } catch (cause) {
    throw new Error(
      `${sourceURL}: Invalid source map. Only conformant source maps can be used to find the original code.`,
      { cause }
    )
  }

  if (nativeSourceMap !== undefined) {
    const sourceMapPayload = nativeSourceMap.payload
    return {
      type: 'file',
      sourceMap: sourceMapPayload,
      ignoredSources: getIgnoredSources(sourceMapPayload),
      moduleURL: sourceURL,
    }
  }

  if (path.isAbsolute(sourceURL)) {
    sourceURL = pathToFileURL(sourceURL).href
  }

  if (sourceURL.startsWith('file:')) {
    const sourceMap = await getSourceMapFromFile(sourceURL)
    return sourceMap
      ? {
          type: 'file',
          sourceMap,
          ignoredSources: getIgnoredSources(sourceMap),
          moduleURL: sourceURL,
        }
      : undefined
  }

  // webpack-internal:///./src/hello.tsx => ./src/hello.tsx
  // rsc://React/Server/webpack-internal:///(rsc)/./src/hello.tsx?42 => (rsc)/./src/hello.tsx
  // webpack://_N_E/./src/hello.tsx => ./src/hello.tsx
  const moduleId = sourceURL
    .replace(
      /^(rsc:\/\/React\/[^/]+\/)?(webpack-internal:\/\/\/|webpack:\/\/(_N_E\/)?)/,
      ''
    )
    .replace(/\?\d+$/, '')

  // (rsc)/./src/hello.tsx => ./src/hello.tsx
  const moduleURL = moduleId.replace(/^(\(.*\)\/?)/, '')

  for (const compilation of getCompilations()) {
    const sourceMap = await getSourceMapFromCompilation(moduleId, compilation)

    if (sourceMap) {
      const ignoredSources = getIgnoredSources(sourceMap)
      return {
        type: 'bundle',
        sourceMap,
        compilation,
        moduleId,
        moduleURL,
        ignoredSources,
      }
    }
  }

  return undefined
}

function getOriginalStackFrames({
  isServer,
  isEdgeServer,
  isAppDirectory,
  frames,
  clientStats,
  serverStats,
  edgeServerStats,
  rootDirectory,
}: {
  isServer: boolean
  isEdgeServer: boolean
  isAppDirectory: boolean
  frames: StackFrame[]
  clientStats: () => webpack.Stats | null
  serverStats: () => webpack.Stats | null
  edgeServerStats: () => webpack.Stats | null
  rootDirectory: string
}): Promise<OriginalStackFramesResponse> {
  return Promise.all(
    frames.map(
      (frame): Promise<OriginalStackFramesResponse[number]> =>
        getOriginalStackFrame({
          isServer,
          isEdgeServer,
          isAppDirectory,
          frame,
          clientStats,
          serverStats,
          edgeServerStats,
          rootDirectory,
        }).then(
          (value) => {
            return {
              status: 'fulfilled',
              value,
            }
          },
          (reason) => {
            return {
              status: 'rejected',
              reason: inspect(reason, { colors: false }),
            }
          }
        )
    )
  )
}

async function getOriginalStackFrame({
  isServer,
  isEdgeServer,
  isAppDirectory,
  frame,
  clientStats,
  serverStats,
  edgeServerStats,
  rootDirectory,
}: {
  isServer: boolean
  isEdgeServer: boolean
  isAppDirectory: boolean
  frame: StackFrame
  clientStats: () => webpack.Stats | null
  serverStats: () => webpack.Stats | null
  edgeServerStats: () => webpack.Stats | null
  rootDirectory: string
}): Promise<OriginalStackFrameResponse> {
  const filename = frame.file ?? ''
  const source = await getSource(filename, {
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

  // This stack frame is used for the one that couldn't locate the source or source mapped frame
  const defaultStackFrame: IgnorableStackFrame = {
    file: frame.file,
    lineNumber: frame.lineNumber,
    column: frame.column ?? 1,
    methodName: frame.methodName,
    ignored: shouldIgnoreSource(filename),
    arguments: [],
  }
  if (!source) {
    // return original stack frame with no source map
    return {
      originalStackFrame: defaultStackFrame,
      originalCodeFrame: null,
    }
  }

  const originalStackFrameResponse = await createOriginalStackFrame({
    frame,
    source,
    rootDirectory,
  })

  if (!originalStackFrameResponse) {
    return {
      originalStackFrame: defaultStackFrame,
      originalCodeFrame: null,
    }
  }

  return originalStackFrameResponse
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

    if (pathname === '/__nextjs_original-stack-frames') {
      if (req.method !== 'POST') {
        return middlewareResponse.badRequest(res)
      }

      const body = await new Promise<string>((resolve, reject) => {
        let data = ''
        req.on('data', (chunk) => {
          data += chunk
        })
        req.on('end', () => resolve(data))
        req.on('error', reject)
      })

      try {
        const { frames, isServer, isEdgeServer, isAppDirectory } = JSON.parse(
          body
        ) as OriginalStackFramesRequest

        return middlewareResponse.json(
          res,
          await getOriginalStackFrames({
            isServer,
            isEdgeServer,
            isAppDirectory,
            frames: frames.map((frame) => ({
              ...frame,
              lineNumber: frame.lineNumber ?? 0,
              column: frame.column ?? 0,
            })),
            clientStats,
            serverStats,
            edgeServerStats,
            rootDirectory,
          })
        )
      } catch (err) {
        return middlewareResponse.badRequest(res)
      }
    } else if (pathname === '/__nextjs_launch-editor') {
      const frame = {
        file: searchParams.get('file') as string,
        methodName: searchParams.get('methodName') as string,
        lineNumber: parseInt(searchParams.get('lineNumber') ?? '0', 10) || 0,
        column: parseInt(searchParams.get('column') ?? '0', 10) || 0,
        arguments: searchParams.getAll('arguments').filter(Boolean),
      } satisfies StackFrame

      if (!frame.file) return middlewareResponse.badRequest(res)

      // frame files may start with their webpack layer, like (middleware)/middleware.js
      const filePath = path.resolve(
        rootDirectory,
        frame.file.replace(/^\([^)]+\)\//, '')
      )
      const fileExists = await fs.access(filePath, FS.F_OK).then(
        () => true,
        () => false
      )
      if (!fileExists) return middlewareResponse.notFound(res)

      try {
        launchEditor(filePath, frame.lineNumber, frame.column ?? 1)
      } catch (err) {
        console.log('Failed to launch editor:', err)
        return middlewareResponse.internalServerError(res)
      }

      return middlewareResponse.noContent(res)
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
      return middlewareResponse.badRequest(res)
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
      return middlewareResponse.internalServerError(res, error)
    }

    if (!source) {
      return middlewareResponse.noContent(res)
    }

    return middlewareResponse.json(res, source.sourceMap)
  }
}
