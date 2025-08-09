import { findSourceMap, type SourceMap } from 'module'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { SourceMapConsumer } from 'next/dist/compiled/source-map08'
import { getSourceMapFromFile } from './get-source-map-from-file'
import {
  devirtualizeReactServerURL,
  findApplicableSourceMapPayload,
  sourceMapIgnoreListsEverything,
  type BasicSourceMapPayload,
  type ModernSourceMapPayload,
} from '../lib/source-maps'
import { openFileInEditor } from '../../next-devtools/server/launch-editor'
import {
  getOriginalCodeFrame,
  ignoreListAnonymousStackFramesIfSandwiched,
  type StackFrame,
  type IgnorableStackFrame,
  type OriginalStackFrameResponse,
  type OriginalStackFramesRequest,
  type OriginalStackFramesResponse,
} from '../../next-devtools/server/shared'
import { middlewareResponse } from '../../next-devtools/server/middleware-response'

import type { IncomingMessage, ServerResponse } from 'http'
import type webpack from 'webpack'
import type {
  NullableMappedPosition,
  RawSourceMap,
} from 'next/dist/compiled/source-map08'
import { formatFrameSourceFile } from '../../next-devtools/shared/webpack-module-path'
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

type SourceAttributes = {
  sourcePosition: NullableMappedPosition
  sourceContent: string | null
}

type Source =
  | {
      type: 'file'
      sourceMap: BasicSourceMapPayload
      ignoredSources: IgnoredSources
      moduleURL: string
    }
  | {
      type: 'bundle'
      sourceMap: BasicSourceMapPayload
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
  sourceMap: ModernSourceMapPayload,
  position: { line1: number | null; column1: number | null }
): Promise<SourceAttributes | null> {
  let consumer: SourceMapConsumer
  try {
    consumer = await new SourceMapConsumer(sourceMap)
  } catch (cause) {
    console.error(
      new Error(
        `${sourceMap.file}: Invalid source map. Only conformant source maps can be used to find the original code.`,
        { cause }
      )
    )
    return null
  }

  try {
    const sourcePosition = consumer.originalPositionFor({
      line: position.line1 ?? 1,
      // 0-based columns out requires 0-based columns in.
      column: (position.column1 ?? 1) - 1,
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
  ignoredByDefault,
  source,
  rootDirectory,
  frame,
  errorMessage,
}: {
  /** setting this to true will not consult ignoreList */
  ignoredByDefault: boolean
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
    ignoredByDefault ||
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
    line1: sourcePosition.line,
    column1: sourcePosition.column === null ? null : sourcePosition.column + 1,
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
  frame: {
    file: string | null
    line1: number | null
    column1: number | null
  },
  options: {
    getCompilations: () => webpack.Compilation[]
  }
): Promise<Source | undefined> {
  let sourceURL = frame.file ?? ''
  const { getCompilations } = options

  sourceURL = devirtualizeReactServerURL(sourceURL)

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
      sourceMap: findApplicableSourceMapPayload(
        (frame.line1 ?? 1) - 1,
        (frame.column1 ?? 1) - 1,
        sourceMapPayload
      )!,

      ignoredSources: getIgnoredSources(
        // @ts-expect-error -- TODO: Support IndexSourceMap
        sourceMapPayload
      ),
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
  // webpack://_N_E/./src/hello.tsx => ./src/hello.tsx
  const moduleId = sourceURL
    .replace(/^(webpack-internal:\/\/\/|webpack:\/\/(_N_E\/)?)/, '')
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

export async function getOriginalStackFrames({
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
  frames: readonly StackFrame[]
  clientStats: () => webpack.Stats | null
  serverStats: () => webpack.Stats | null
  edgeServerStats: () => webpack.Stats | null
  rootDirectory: string
}): Promise<OriginalStackFramesResponse> {
  const frameResponses = await Promise.all(
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

  ignoreListAnonymousStackFramesIfSandwiched(frameResponses)

  return frameResponses
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
  const source = await getSource(frame, {
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

  let defaultNormalizedStackFrameLocation = frame.file
  if (
    defaultNormalizedStackFrameLocation !== null &&
    defaultNormalizedStackFrameLocation.startsWith('file://')
  ) {
    defaultNormalizedStackFrameLocation = path.relative(
      rootDirectory,
      fileURLToPath(defaultNormalizedStackFrameLocation)
    )
  }
  // This stack frame is used for the one that couldn't locate the source or source mapped frame
  const defaultStackFrame: IgnorableStackFrame = {
    file: defaultNormalizedStackFrameLocation,
    line1: frame.line1,
    column1: frame.column1,
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
  defaultStackFrame.ignored ||= sourceMapIgnoreListsEverything(source.sourceMap)

  const originalStackFrameResponse = await createOriginalStackFrame({
    ignoredByDefault: defaultStackFrame.ignored,
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
  isSrcDir: boolean
  clientStats: () => webpack.Stats | null
  serverStats: () => webpack.Stats | null
  edgeServerStats: () => webpack.Stats | null
}) {
  const { rootDirectory, isSrcDir, clientStats, serverStats, edgeServerStats } =
    options

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
            frames,
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
        line1: parseInt(searchParams.get('line1') ?? '1', 10) || 1,
        column1: parseInt(searchParams.get('column1') ?? '1', 10) || 1,
        arguments: searchParams.getAll('arguments').filter(Boolean),
      } satisfies StackFrame

      if (!frame.file) return middlewareResponse.badRequest(res)

      let openEditorResult
      const isAppRelativePath = searchParams.get('isAppRelativePath') === '1'
      if (isAppRelativePath) {
        const relativeFilePath = searchParams.get('file') || ''
        const appPath = path.join(
          'app',
          isSrcDir ? 'src' : '',
          relativeFilePath
        )
        openEditorResult = await openFileInEditor(appPath, 1, 1, rootDirectory)
      } else {
        // TODO: How do we differentiate layers and actual file paths with round brackets?
        // frame files may start with their webpack layer, like (middleware)/middleware.js
        const filePath = frame.file.replace(/^\([^)]+\)\//, '')
        openEditorResult = await openFileInEditor(
          filePath,
          frame.line1,
          frame.column1 ?? 1,
          rootDirectory
        )
      }
      if (openEditorResult.error) {
        console.error('Failed to launch editor:', openEditorResult.error)
        return middlewareResponse.internalServerError(
          res,
          openEditorResult.error
        )
      }
      if (!openEditorResult.found) {
        return middlewareResponse.notFound(res)
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
      source = await getSource(
        {
          file: filename,
          // Webpack doesn't use Index Source Maps
          line1: null,
          column1: null,
        },
        {
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
        }
      )
    } catch (error) {
      return middlewareResponse.internalServerError(res, error)
    }

    if (!source) {
      return middlewareResponse.noContent(res)
    }

    return middlewareResponse.json(res, source.sourceMap)
  }
}
