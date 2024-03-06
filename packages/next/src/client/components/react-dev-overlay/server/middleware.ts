import { constants as FS, promises as fs } from 'fs'
import path from 'path'
import { SourceMapConsumer } from 'next/dist/compiled/source-map08'
import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import { getRawSourceMap } from '../internal/helpers/getRawSourceMap'
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
export { getServerError } from '../internal/helpers/nodeStackFrames'
export { parseStack } from '../internal/helpers/parseStack'

import type { IncomingMessage, ServerResponse } from 'http'
import type webpack from 'webpack'

type Source = { map: () => any } | null

function getModuleId(compilation: any, module: any) {
  return compilation.chunkGraph.getModuleId(module)
}

function getModuleById(
  id: string | undefined,
  compilation: webpack.Compilation
) {
  return [...compilation.modules].find(
    (searchModule) => getModuleId(compilation, searchModule) === id
  )
}

function findModuleNotFoundFromError(errorMessage: string | undefined) {
  return errorMessage?.match(/'([^']+)' module/)?.[1]
}

function getModuleSource(compilation: any, module: any): any {
  if (!module) return null
  return (
    compilation.codeGenerationResults.get(module)?.sources.get('javascript') ??
    null
  )
}

function getSourcePath(source: string) {
  return source.replace(/^(webpack:\/\/\/|webpack:\/\/|webpack:\/\/_N_E\/)/, '')
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
  source,
  moduleId,
  modulePath,
  rootDirectory,
  frame,
  errorMessage,
  compilation,
}: {
  source: any
  moduleId?: string
  modulePath?: string
  rootDirectory: string
  frame: StackFrame
  errorMessage?: string
  compilation?: webpack.Compilation
}): Promise<OriginalStackFrameResponse | null> {
  const { lineNumber, column } = frame
  const moduleNotFound = findModuleNotFoundFromError(errorMessage)
  const result = await (async () => {
    if (moduleNotFound) {
      if (!compilation) return null

      return findOriginalSourcePositionAndContentFromCompilation(
        moduleId,
        moduleNotFound,
        compilation
      )
    }
    // This returns 1-based lines and 0-based columns
    return await findOriginalSourcePositionAndContent(source, {
      line: lineNumber ?? 1,
      column,
    })
  })()

  if (!result?.sourcePosition.source) return null

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

export function getOverlayMiddleware(options: {
  rootDirectory: string
  stats(): webpack.Stats | null
  serverStats(): webpack.Stats | null
  edgeServerStats(): webpack.Stats | null
}) {
  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: Function
  ) {
    const { pathname, searchParams } = new URL(`http://n${req.url}`)

    const frame = {
      file: searchParams.get('file') as string,
      methodName: searchParams.get('methodName') as string,
      lineNumber: parseInt(searchParams.get('lineNumber') ?? '0', 10) || 0,
      column: parseInt(searchParams.get('column') ?? '0', 10) || 0,
      arguments: searchParams.getAll('arguments').filter(Boolean),
    } satisfies StackFrame

    const isServer = searchParams.get('isServer') === 'true'
    const isEdgeServer = searchParams.get('isEdgeServer') === 'true'
    const isAppDirectory = searchParams.get('isAppDirectory') === 'true'

    if (pathname === '/__nextjs_original-stack-frame') {
      const isClient = !isServer && !isEdgeServer

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

      let source: Source = null

      let compilation: webpack.Compilation | undefined

      const isFile = frame.file.startsWith('file:')

      try {
        if (isClient || isAppDirectory) {
          compilation = options.stats()?.compilation
          // Try Client Compilation first
          // In `pages` we leverage `isClientError` to check
          // In `app` it depends on if it's a server / client component and when the code throws. E.g. during HTML rendering it's the server/edge compilation.
          source = await getSourceById(isFile, moduleId, compilation)
        }
        // Try Server Compilation
        // In `pages` this could be something imported in getServerSideProps/getStaticProps as the code for those is tree-shaken.
        // In `app` this finds server components and code that was imported from a server component. It also covers when client component code throws during HTML rendering.
        if ((isServer || isAppDirectory) && source === null) {
          compilation = options.serverStats()?.compilation
          source = await getSourceById(isFile, moduleId, compilation)
        }
        // Try Edge Server Compilation
        // Both cases are the same as Server Compilation, main difference is that it covers `runtime: 'edge'` pages/app routes.
        if ((isEdgeServer || isAppDirectory) && source === null) {
          compilation = options.edgeServerStats()?.compilation
          source = await getSourceById(isFile, moduleId, compilation)
        }
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
          source,
          moduleId,
          modulePath,
          rootDirectory: options.rootDirectory,
          compilation,
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
      if (!frame.file) return badRequest(res)

      // frame files may start with their webpack layer, like (middleware)/middleware.js
      const filePath = path.resolve(
        options.rootDirectory,
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
