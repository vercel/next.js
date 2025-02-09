import type { IncomingMessage, ServerResponse } from 'http'
import {
  badRequest,
  getOriginalCodeFrame,
  internalServerError,
  json,
  jsonString,
  noContent,
  type OriginalStackFrameResponse,
  type OriginalStackFramesRequest,
  type OriginalStackFramesResponse,
} from './shared'

import fs, { constants as FS } from 'fs/promises'
import path from 'path'
import url from 'url'
import { launchEditor } from '../internal/helpers/launchEditor'
import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import {
  SourceMapConsumer,
  type BasicSourceMapConsumer,
  type NullableMappedPosition,
} from 'next/dist/compiled/source-map08'
import type { Project, TurbopackStackFrame } from '../../../../build/swc/types'
import { getSourceMapFromFile } from '../internal/helpers/get-source-map-from-file'
import { findSourceMap, type SourceMapPayload } from 'node:module'
import { pathToFileURL } from 'node:url'
import { inspect } from 'node:util'

function shouldIgnorePath(modulePath: string): boolean {
  return (
    modulePath.includes('node_modules') ||
    // Only relevant for when Next.js is symlinked e.g. in the Next.js monorepo
    modulePath.includes('next/dist') ||
    modulePath.startsWith('node:')
  )
}

type IgnorableStackFrame = StackFrame & { ignored: boolean }

const currentSourcesByFile: Map<string, Promise<string | null>> = new Map()
export async function batchedTraceSource(
  project: Project,
  frame: TurbopackStackFrame
): Promise<{ frame: IgnorableStackFrame; source: string | null } | undefined> {
  const file = frame.file
    ? // TODO(veil): Why are the frames sent encoded?
      decodeURIComponent(frame.file)
    : undefined

  if (!file) return

  // For node internals they cannot traced the actual source code with project.traceSource,
  // we need an early return to indicate it's ignored to avoid the unknown scheme error from `project.traceSource`.
  if (file.startsWith('node:')) {
    return {
      frame: {
        file,
        lineNumber: frame.line ?? 0,
        column: frame.column ?? 0,
        methodName: frame.methodName ?? '<unknown>',
        ignored: true,
        arguments: [],
      },
      source: null,
    }
  }

  const currentDirectoryFileUrl = pathToFileURL(process.cwd()).href

  const sourceFrame = await project.traceSource(frame, currentDirectoryFileUrl)
  if (!sourceFrame) {
    return {
      frame: {
        file,
        lineNumber: frame.line ?? 0,
        column: frame.column ?? 0,
        methodName: frame.methodName ?? '<unknown>',
        ignored: shouldIgnorePath(file),
        arguments: [],
      },
      source: null,
    }
  }

  let source = null
  const originalFile = sourceFrame.originalFile

  // Don't look up source for node_modules or internals. These can often be large bundled files.
  const ignored =
    shouldIgnorePath(originalFile ?? sourceFrame.file) ||
    // isInternal means resource starts with turbopack://[turbopack]
    !!sourceFrame.isInternal
  if (originalFile && !ignored) {
    let sourcePromise = currentSourcesByFile.get(originalFile)
    if (!sourcePromise) {
      sourcePromise = project.getSourceForAsset(originalFile)
      currentSourcesByFile.set(originalFile, sourcePromise)
      setTimeout(() => {
        // Cache file reads for 100ms, as frames will often reference the same
        // files and can be large.
        currentSourcesByFile.delete(originalFile!)
      }, 100)
    }
    source = await sourcePromise
  }

  // TODO: get ignoredList from turbopack source map
  const ignorableFrame = {
    file: sourceFrame.file,
    lineNumber: sourceFrame.line ?? 0,
    column: sourceFrame.column ?? 0,
    methodName:
      // We ignore the sourcemapped name since it won't be the correct name.
      // The callsite will point to the column of the variable name instead of the
      // name of the enclosing function.
      // TODO(NDX-531): Spy on prepareStackTrace to get the enclosing line number for method name mapping.
      frame.methodName ?? '<unknown>',
    ignored,
    arguments: [],
  }

  return {
    frame: ignorableFrame,
    source,
  }
}
function parseFile(fileParam: string | null): string | undefined {
  if (!fileParam) {
    return undefined
  }

  // rsc://React/Server/file://<filename>?42 => file://<filename>
  return fileParam.replace(/^rsc:\/\/React\/[^/]+\//, '').replace(/\?\d+$/, '')
}

function createStackFrames(
  body: OriginalStackFramesRequest
): TurbopackStackFrame[] {
  const { frames, isServer } = body

  return frames
    .map((frame): TurbopackStackFrame | undefined => {
      const file = parseFile(frame.file)

      if (!file) {
        return undefined
      }

      return {
        file,
        methodName: frame.methodName ?? '<unknown>',
        line: frame.lineNumber ?? 0,
        column: frame.column ?? 0,
        isServer,
      } satisfies TurbopackStackFrame
    })
    .filter((f): f is TurbopackStackFrame => f !== undefined)
}

function createStackFrame(
  searchParams: URLSearchParams
): TurbopackStackFrame | undefined {
  const file = parseFile(searchParams.get('file'))

  if (!file) {
    return undefined
  }

  return {
    file,
    methodName: searchParams.get('methodName') ?? '<unknown>',
    line: parseInt(searchParams.get('lineNumber') ?? '0', 10) || 0,
    column: parseInt(searchParams.get('column') ?? '0', 10) || 0,
    isServer: searchParams.get('isServer') === 'true',
  } satisfies TurbopackStackFrame
}

/**
 * https://tc39.es/source-map/#index-map
 */
interface IndexSourceMapSection {
  offset: {
    line: number
    column: number
  }
  map: ModernRawSourceMap
}

// TODO(veil): Upstream types
interface IndexSourceMap {
  version: number
  file: string
  sections: IndexSourceMapSection[]
}

interface ModernRawSourceMap extends SourceMapPayload {
  ignoreList?: number[]
}

type ModernSourceMapPayload = ModernRawSourceMap | IndexSourceMap

/**
 * Finds the sourcemap payload applicable to a given frame.
 * Equal to the input unless an Index Source Map is used.
 */
function findApplicableSourceMapPayload(
  frame: TurbopackStackFrame,
  payload: ModernSourceMapPayload
): ModernRawSourceMap | undefined {
  if ('sections' in payload) {
    const frameLine = frame.line ?? 0
    const frameColumn = frame.column ?? 0
    // Sections must not overlap and must be sorted: https://tc39.es/source-map/#section-object
    // Therefore the last section that has an offset less than or equal to the frame is the applicable one.
    // TODO(veil): Binary search
    let section: IndexSourceMapSection | undefined = payload.sections[0]
    for (
      let i = 0;
      i < payload.sections.length &&
      payload.sections[i].offset.line <= frameLine &&
      payload.sections[i].offset.column <= frameColumn;
      i++
    ) {
      section = payload.sections[i]
    }

    return section === undefined ? undefined : section.map
  } else {
    return payload
  }
}

async function nativeTraceSource(
  frame: TurbopackStackFrame
): Promise<{ frame: IgnorableStackFrame; source: string | null } | undefined> {
  const sourceURL = // TODO(veil): Why are the frames sent encoded?
    decodeURIComponent(frame.file)
  let sourceMapPayload: ModernSourceMapPayload | undefined
  try {
    sourceMapPayload = findSourceMap(sourceURL)?.payload
  } catch (cause) {
    throw new Error(
      `${sourceURL}: Invalid source map. Only conformant source maps can be used to find the original code.`,
      { cause }
    )
  }

  if (sourceMapPayload !== undefined) {
    let consumer: BasicSourceMapConsumer
    try {
      consumer = await new SourceMapConsumer(sourceMapPayload)
    } catch (cause) {
      throw new Error(
        `${sourceURL}: Invalid source map. Only conformant source maps can be used to find the original code.`,
        { cause }
      )
    }
    let traced: {
      originalPosition: NullableMappedPosition
      sourceContent: string | null
    } | null
    try {
      const originalPosition = consumer.originalPositionFor({
        line: frame.line ?? 1,
        column: frame.column ?? 1,
      })

      if (originalPosition.source === null) {
        traced = null
      } else {
        const sourceContent: string | null =
          consumer.sourceContentFor(
            originalPosition.source,
            /* returnNullOnMissing */ true
          ) ?? null

        traced = { originalPosition, sourceContent }
      }
    } finally {
      consumer.destroy()
    }

    if (traced !== null) {
      const { originalPosition, sourceContent } = traced
      const applicableSourceMap = findApplicableSourceMapPayload(
        frame,
        sourceMapPayload
      )

      // TODO(veil): Upstream a method to sourcemap consumer that immediately says if a frame is ignored or not.
      let ignored = false
      if (applicableSourceMap === undefined) {
        console.error(
          'No applicable source map found in sections for frame',
          frame
        )
      } else {
        // TODO: O(n^2). Consider moving `ignoreList` into a Set
        const sourceIndex = applicableSourceMap.sources.indexOf(
          originalPosition.source!
        )
        ignored =
          applicableSourceMap.ignoreList?.includes(sourceIndex) ??
          // When sourcemap is not available, fallback to checking `frame.file`.
          // e.g. In pages router, nextjs server code is not bundled into the page.
          shouldIgnorePath(frame.file)
      }

      const originalStackFrame: IgnorableStackFrame = {
        methodName:
          // We ignore the sourcemapped name since it won't be the correct name.
          // The callsite will point to the column of the variable name instead of the
          // name of the enclosing function.
          // TODO(NDX-531): Spy on prepareStackTrace to get the enclosing line number for method name mapping.
          frame.methodName
            ?.replace('__WEBPACK_DEFAULT_EXPORT__', 'default')
            ?.replace('__webpack_exports__.', '') || '<unknown>',
        column: (originalPosition.column ?? 0) + 1,
        file: originalPosition.source?.startsWith('file://')
          ? relativeToCwd(originalPosition.source)
          : originalPosition.source,
        lineNumber: originalPosition.line ?? 0,
        // TODO: c&p from async createOriginalStackFrame but why not frame.arguments?
        arguments: [],
        ignored,
      }

      return {
        frame: originalStackFrame,
        source: sourceContent,
      }
    }
  }

  return undefined
}

function relativeToCwd(file: string): string {
  const relPath = path.relative(process.cwd(), url.fileURLToPath(file))
  // TODO(sokra) include a ./ here to make it a relative path
  return relPath
}

async function createOriginalStackFrame(
  project: Project,
  frame: TurbopackStackFrame
): Promise<OriginalStackFrameResponse | null> {
  const traced =
    (await nativeTraceSource(frame)) ??
    // TODO(veil): When would the bundler know more than native?
    // If it's faster, try the bundler first and fall back to native later.
    (await batchedTraceSource(project, frame))
  if (!traced) {
    return null
  }

  return {
    originalStackFrame: traced.frame,
    originalCodeFrame: getOriginalCodeFrame(traced.frame, traced.source),
  }
}

export function getOverlayMiddleware(project: Project) {
  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const { pathname, searchParams } = new URL(req.url!, 'http://n')

    if (pathname === '/__nextjs_original-stack-frames') {
      if (req.method !== 'POST') {
        return badRequest(res)
      }

      const body = await new Promise<string>((resolve, reject) => {
        let data = ''
        req.on('data', (chunk) => {
          data += chunk
        })
        req.on('end', () => resolve(data))
        req.on('error', reject)
      })

      const request = JSON.parse(body) as OriginalStackFramesRequest
      const stackFrames = createStackFrames(request)
      const result: OriginalStackFramesResponse = await Promise.all(
        stackFrames.map(async (frame) => {
          try {
            const stackFrame = await createOriginalStackFrame(project, frame)
            if (stackFrame === null) {
              return {
                status: 'rejected',
                reason: 'Failed to create original stack frame',
              }
            }
            return { status: 'fulfilled', value: stackFrame }
          } catch (error) {
            return {
              status: 'rejected',
              reason: inspect(error, { colors: false }),
            }
          }
        })
      )

      return json(res, result)
    } else if (pathname === '/__nextjs_launch-editor') {
      const frame = createStackFrame(searchParams)

      if (!frame) return badRequest(res)

      const fileExists = await fs.access(frame.file, FS.F_OK).then(
        () => true,
        () => false
      )
      if (!fileExists) return noContent(res)

      try {
        launchEditor(frame.file, frame.line ?? 1, frame.column ?? 1)
      } catch (err) {
        console.log('Failed to launch editor:', err)
        return internalServerError(res)
      }

      noContent(res)
    }

    return next()
  }
}

export function getSourceMapMiddleware(project: Project) {
  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const { pathname, searchParams } = new URL(req.url!, 'http://n')

    if (pathname !== '/__nextjs_source-map') {
      return next()
    }

    let filename = searchParams.get('filename')

    if (!filename) {
      return badRequest(res)
    }

    // TODO(veil): Always try the native version first.
    // Externals could also be files that aren't bundled via Webpack.
    if (
      filename.startsWith('webpack://') ||
      filename.startsWith('webpack-internal:///')
    ) {
      const sourceMap = findSourceMap(filename)

      if (sourceMap) {
        return json(res, sourceMap.payload)
      }

      return noContent(res)
    }

    try {
      // Turbopack chunk filenames might be URL-encoded.
      filename = decodeURI(filename)

      if (path.isAbsolute(filename)) {
        filename = url.pathToFileURL(filename).href
      }

      const sourceMapString = await project.getSourceMap(filename)

      if (sourceMapString) {
        return jsonString(res, sourceMapString)
      }

      if (filename.startsWith('file:')) {
        const sourceMap = await getSourceMapFromFile(filename)

        if (sourceMap) {
          return json(res, sourceMap)
        }
      }
    } catch (error) {
      console.error('Failed to get source map:', error)
    }

    noContent(res)
  }
}
