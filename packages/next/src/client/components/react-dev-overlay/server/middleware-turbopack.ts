import type { IncomingMessage, ServerResponse } from 'http'
import {
  badRequest,
  findSourcePackage,
  getOriginalCodeFrame,
  internalServerError,
  json,
  jsonString,
  noContent,
  type OriginalStackFrameResponse,
} from './shared'

import fs, { constants as FS } from 'fs/promises'
import path from 'path'
import url from 'url'
import { launchEditor } from '../internal/helpers/launchEditor'
import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import type { Project, TurbopackStackFrame } from '../../../../build/swc/types'
import { getSourceMapFromFile } from '../internal/helpers/get-source-map-from-file'
import { findSourceMap } from 'node:module'

function shouldIgnorePath(modulePath: string): boolean {
  return (
    modulePath.includes('node_modules') ||
    // Only relevant for when Next.js is symlinked e.g. in the Next.js monorepo
    modulePath.includes('next/dist')
  )
}

type IgnorableStackFrame = StackFrame & { ignored: boolean }

const currentSourcesByFile: Map<string, Promise<string | null>> = new Map()
export async function batchedTraceSource(
  project: Project,
  frame: TurbopackStackFrame
): Promise<{ frame: IgnorableStackFrame; source: string | null } | undefined> {
  const file = frame.file ? decodeURIComponent(frame.file) : undefined
  if (!file) return

  const sourceFrame = await project.traceSource(frame)
  if (!sourceFrame) return

  let source = null
  // Don't look up source for node_modules or internals. These can often be large bundled files.
  const ignored =
    shouldIgnorePath(sourceFrame.file) ||
    // isInternal means resource starts with turbopack://[turbopack]
    !!sourceFrame.isInternal
  if (sourceFrame.file && !ignored) {
    let sourcePromise = currentSourcesByFile.get(sourceFrame.file)
    if (!sourcePromise) {
      sourcePromise = project.getSourceForAsset(sourceFrame.file)
      currentSourcesByFile.set(sourceFrame.file, sourcePromise)
      setTimeout(() => {
        // Cache file reads for 100ms, as frames will often reference the same
        // files and can be large.
        currentSourcesByFile.delete(sourceFrame.file!)
      }, 100)
    }
    source = await sourcePromise
  }

  // TODO: get ignoredList from turbopack source map
  const ignorableFrame = {
    file: sourceFrame.file,
    lineNumber: sourceFrame.line ?? 0,
    column: sourceFrame.column ?? 0,
    methodName: sourceFrame.methodName ?? frame.methodName ?? '<unknown>',
    ignored,
    arguments: [],
  }

  return {
    frame: ignorableFrame,
    source,
  }
}

function createStackFrame(searchParams: URLSearchParams) {
  const fileParam = searchParams.get('file')

  if (!fileParam) {
    return undefined
  }

  // rsc://React/Server/file://<filename>?42 => file://<filename>
  const file = fileParam
    .replace(/^rsc:\/\/React\/[^/]+\//, '')
    .replace(/\?\d+$/, '')

  return {
    file,
    methodName: searchParams.get('methodName') ?? '<unknown>',
    line: parseInt(searchParams.get('lineNumber') ?? '0', 10) || 0,
    column: parseInt(searchParams.get('column') ?? '0', 10) || 0,
    isServer: searchParams.get('isServer') === 'true',
  } satisfies TurbopackStackFrame
}

export async function createOriginalStackFrame(
  project: Project,
  frame: TurbopackStackFrame
): Promise<OriginalStackFrameResponse | null> {
  const traced = await batchedTraceSource(project, frame)
  if (!traced) {
    const sourcePackage = findSourcePackage(frame)
    if (sourcePackage) return { sourcePackage }
    return null
  }

  return {
    originalStackFrame: traced.frame,
    originalCodeFrame: getOriginalCodeFrame(traced.frame, traced.source),
    sourcePackage: findSourcePackage(traced.frame),
  }
}

export function getOverlayMiddleware(project: Project) {
  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const { pathname, searchParams } = new URL(req.url!, 'http://n')

    if (pathname === '/__nextjs_original-stack-frame') {
      const frame = createStackFrame(searchParams)

      if (!frame) return badRequest(res)

      let originalStackFrame: OriginalStackFrameResponse | null
      try {
        originalStackFrame = await createOriginalStackFrame(project, frame)
      } catch (e: any) {
        return internalServerError(res, e.message)
      }

      if (!originalStackFrame) {
        res.statusCode = 404
        res.end('Unable to resolve sourcemap')
        return
      }

      return json(res, originalStackFrame)
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
