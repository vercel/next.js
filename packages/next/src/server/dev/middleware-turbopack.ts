import type { IncomingMessage, ServerResponse } from 'http'
import {
  DEVTOOLS_CODE_FRAME_MAX_WIDTH,
  getOriginalCodeFrame,
  ignoreListAnonymousStackFramesIfSandwiched,
  type IgnorableStackFrame,
  type OriginalStackFrameResponse,
  type OriginalStackFramesRequest,
  type OriginalStackFramesResponse,
  type StackFrame,
} from '../../next-devtools/server/shared'
import { middlewareResponse } from '../../next-devtools/server/middleware-response'
import path from 'path'
import { openFileInEditor } from '../../next-devtools/server/launch-editor'
import {
  SourceMapConsumer,
  type NullableMappedPosition,
} from 'next/dist/compiled/source-map08'
import type { Project, TurbopackStackFrame } from '../../build/swc/types'
import {
  type ModernSourceMapPayload,
  SOURCE_CONTENT_ENDPOINT_PREFIX,
  devirtualizeReactServerURL,
  findApplicableSourceMapPayload,
  stripSourceRoot,
} from '../lib/source-maps'
import { findSourceMap, type SourceMap } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { inspect } from 'node:util'

function shouldIgnorePath(modulePath: string): boolean {
  return (
    modulePath.includes('node_modules') ||
    // Only relevant for when Next.js is symlinked e.g. in the Next.js monorepo
    modulePath.includes('next/dist') ||
    modulePath.startsWith('node:')
  )
}

/**
 * Code frame rendering options. The defaults match terminal consumers; only
 * the overlay HTTP path opts in to always-on colors and the wide max width.
 */
type CodeFrameOptions = {
  /** Defaults to `process.stdout.isTTY`. */
  colors?: boolean
  /** Defaults to the dev server's terminal width. */
  maxWidth?: number
}

/**
 * The result of tracing a compiled frame back to its original source.
 *
 * `getCodeFrame` renders the original code frame lazily. The two trace paths
 * implement it differently: the native path already holds the source in-process
 * (from inline `sourcesContent` or disk) and renders in JS, while the bundler
 * path fuses read+render in a single native call so the (potentially large)
 * source string never crosses the napi boundary.
 */
type TracedSource = {
  frame: IgnorableStackFrame
  getCodeFrame: (
    options: CodeFrameOptions
  ) => string | null | Promise<string | null>
}

/**
 * A code frame that is already known to be empty (node internals, ignored
 * frames, or frames without a resolvable original file).
 */
const NO_CODE_FRAME = (): null => null

/**
 * @returns 1-based lines and 1-based columns
 */
async function batchedTraceSource(
  project: Project,
  frame: TurbopackStackFrame
): Promise<TracedSource | undefined> {
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
        line1: frame.line ?? null,
        column1: frame.column ?? null,
        methodName: frame.methodName ?? '<unknown>',
        ignored: true,
        arguments: [],
      },
      getCodeFrame: NO_CODE_FRAME,
    }
  }

  const currentDirectoryFileUrl = pathToFileURL(process.cwd()).href

  const sourceFrame = await project.traceSource(frame, currentDirectoryFileUrl)
  if (!sourceFrame) {
    return {
      frame: {
        file,
        line1: frame.line ?? null,
        column1: frame.column ?? null,
        methodName: frame.methodName ?? '<unknown>',
        ignored: shouldIgnorePath(file),
        arguments: [],
      },
      getCodeFrame: NO_CODE_FRAME,
    }
  }

  const originalFile = sourceFrame.originalFile

  // Don't look up source for node_modules or internals. These can often be large bundled files.
  const ignored =
    // Check the sourcemap's ignoreList (e.g. from 3rd party packages)
    !!sourceFrame.isIgnored ||
    shouldIgnorePath(originalFile ?? sourceFrame.file)

  const ignorableFrame: IgnorableStackFrame = {
    file: sourceFrame.file,
    line1: sourceFrame.line ?? null,
    column1: sourceFrame.column ?? null,
    methodName:
      // We ignore the sourcemapped name since it won't be the correct name.
      // The callsite will point to the column of the variable name instead of the
      // name of the enclosing function.
      // TODO(NDX-531): Spy on prepareStackTrace to get the enclosing line number for method name mapping.
      frame.methodName ?? '<unknown>',
    ignored,
    arguments: [],
  }

  if (!originalFile || ignored || ignorableFrame.line1 == null) {
    return { frame: ignorableFrame, getCodeFrame: NO_CODE_FRAME }
  }

  return {
    frame: ignorableFrame,
    // Fuse read + render in the native layer: the (potentially large) source
    // string is never laundered through JavaScript just to be handed back to
    // the native code-frame renderer.
    getCodeFrame: (options: CodeFrameOptions) =>
      project.getCodeFrameForAsset(
        originalFile,
        {
          start: {
            line: ignorableFrame.line1 as number,
            column: ignorableFrame.column1 ?? undefined,
          },
        },
        {
          color: options.colors ?? process.stdout?.isTTY ?? false,
          maxWidth: options.maxWidth,
        }
      ),
  }
}

function parseFile(fileParam: string | null): string | undefined {
  if (!fileParam) {
    return undefined
  }

  const file = devirtualizeReactServerURL(fileParam)
  // React virtualizes filenames as `'file://' + path`, which is malformed
  // for paths that need percent-encoding (e.g. a space in the project path)
  // and then fails both Turbopack's `traceSource` and Node.js' source map
  // cache lookups. Re-encode through WHATWG URL parsing.
  // TODO(veil): Revisit if React's virtualization round-trips losslessly.
  if (file.startsWith('file://') && URL.canParse(file)) {
    return new URL(file).href
  }
  return file
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
        line: frame.line1 ?? undefined,
        column: frame.column1 ?? undefined,
        isServer,
      }
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
    line: parseInt(searchParams.get('line1') ?? '0', 10) || undefined,
    column: parseInt(searchParams.get('column1') ?? '0', 10) || undefined,
    isServer: searchParams.get('isServer') === 'true',
  }
}

/**
 * @returns 1-based lines and 1-based columns
 */
async function nativeTraceSource(
  project: Project,
  frame: TurbopackStackFrame
): Promise<TracedSource | undefined> {
  const sourceURL = frame.file
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
    let consumer: SourceMapConsumer
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
      // `originalPosition.source` narrowed to non-null (we only trace when it is present).
      source: string
      sourceContent: string | null
    } | null
    try {
      const originalPosition = consumer.originalPositionFor({
        line: frame.line ?? 1,
        // 0-based columns out requires 0-based columns in.
        column: (frame.column ?? 1) - 1,
      })

      if (originalPosition.source === null) {
        traced = null
      } else {
        const sourceContent: string | null =
          consumer.sourceContentFor(
            originalPosition.source,
            /* returnNullOnMissing */ true
          ) ?? null

        traced = {
          originalPosition,
          source: originalPosition.source,
          sourceContent,
        }
      }
    } finally {
      consumer.destroy()
    }

    if (traced !== null) {
      const { originalPosition, source, sourceContent } = traced
      const applicableSourceMap = findApplicableSourceMapPayload(
        (frame.line ?? 1) - 1,
        (frame.column ?? 1) - 1,
        sourceMapPayload
      )

      // `originalPosition.source` is resolved against the map's `sourceRoot` by the consumer, but
      // `applicableSourceMap.sources` holds the raw (pre-`sourceRoot`) entries. Strip the
      // `sourceRoot` prefix to recover the raw source, used for the ignore-list lookup and for the
      // user-facing `file` (so a `sourceRoot` like the on-demand source-content endpoint doesn't
      // leak into the displayed path). The native code-frame lookup below still uses the
      // un-stripped `originalPosition.source`.
      const rawSource = stripSourceRoot(source, applicableSourceMap?.sourceRoot)

      // TODO(veil): Upstream a method to sourcemap consumer that immediately says if a frame is ignored or not.
      let ignored = false
      if (applicableSourceMap === undefined) {
        console.error(
          'No applicable source map found in sections for frame',
          frame
        )
      } else {
        // TODO: O(n^2). Consider moving `ignoreList` into a Set
        let sourceIndex = applicableSourceMap.sources.indexOf(rawSource)
        if (sourceIndex === -1 && rawSource !== source) {
          // Fall back to the fully-resolved form in case `sources` already includes `sourceRoot`.
          sourceIndex = applicableSourceMap.sources.indexOf(source)
        }
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
        file: rawSource,
        line1: originalPosition.line,
        column1:
          originalPosition.column === null ? null : originalPosition.column + 1,
        // TODO: c&p from async createOriginalStackFrame but why not frame.arguments?
        arguments: [],
        ignored,
      }

      return {
        frame: originalStackFrame,
        getCodeFrame: (options: CodeFrameOptions) => {
          // When the map inlines content, render it in-process. When it omits
          // content (dev with `experimental.turbopackServeSourceContent`), the
          // resolved source is prefixed with the on-demand content `sourceRoot`;
          // read + render it from turbopack in one native call instead. Detect the
          // feature from the un-stripped resolved source (the display `file` has had
          // the `sourceRoot` removed) and use the stripped `rawSource` as the asset path.
          if (
            sourceContent === null &&
            source.startsWith(SOURCE_CONTENT_MIDDLEWARE_PREFIX) &&
            originalStackFrame.line1 != null
          ) {
            return project.getCodeFrameForAsset(
              rawSource,
              {
                start: {
                  line: originalStackFrame.line1,
                  column: originalStackFrame.column1 ?? undefined,
                },
              },
              {
                color: options.colors ?? process.stdout?.isTTY ?? false,
                maxWidth: options.maxWidth,
              }
            )
          }
          return getOriginalCodeFrame(
            originalStackFrame,
            sourceContent,
            options
          )
        },
      }
    }
  }

  return undefined
}

async function createOriginalStackFrame(
  project: Project,
  projectPath: string,
  frame: TurbopackStackFrame,
  codeFrameOptions?: CodeFrameOptions
): Promise<OriginalStackFrameResponse | null> {
  const traced =
    (await nativeTraceSource(project, frame)) ??
    // TODO(veil): When would the bundler know more than native?
    // If it's faster, try the bundler first and fall back to native later.
    (await batchedTraceSource(project, frame))
  if (!traced) {
    return null
  }

  let normalizedStackFrameLocation = traced.frame.file
  if (
    normalizedStackFrameLocation !== null &&
    normalizedStackFrameLocation.startsWith('file://')
  ) {
    normalizedStackFrameLocation = path.relative(
      projectPath,
      fileURLToPath(normalizedStackFrameLocation)
    )
  }

  const tracedFrame = traced.frame
  // Render the code frame now. For the bundler trace path this is a single
  // fused native call (read + render) so the source string never crosses into
  // JS; for the native path it renders from the already in-process source.
  // A render failure (e.g. the file changed/was deleted) must not fail the
  // whole trace — degrade to no code frame.
  let originalCodeFrame: string | null = null
  if (!tracedFrame.ignored) {
    try {
      originalCodeFrame = await traced.getCodeFrame({
        colors: codeFrameOptions?.colors,
        maxWidth: codeFrameOptions?.maxWidth,
      })
    } catch {
      originalCodeFrame = null
    }
  }

  return {
    originalStackFrame: {
      arguments: tracedFrame.arguments,
      file: normalizedStackFrameLocation,
      line1: tracedFrame.line1,
      column1: tracedFrame.column1,
      ignored: tracedFrame.ignored,
      methodName: tracedFrame.methodName,
    },
    originalCodeFrame,
  }
}

export function getOverlayMiddleware({
  project,
  projectPath,
  isSrcDir,
}: {
  project: Project
  projectPath: string
  isSrcDir: boolean
}) {
  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const { pathname, searchParams } = new URL(req.url!, 'http://n')

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

      const request = JSON.parse(body) as OriginalStackFramesRequest
      const result = await getOriginalStackFrames({
        project,
        projectPath,
        frames: request.frames,
        isServer: request.isServer,
        isEdgeServer: request.isEdgeServer,
        isAppDirectory: request.isAppDirectory,
        codeFrameOptions: {
          // Overlay parses ANSI in JS and renders in a scrollable
          // `<pre>`, so colors are always wanted and terminal width is
          // irrelevant.
          colors: true,
          maxWidth: DEVTOOLS_CODE_FRAME_MAX_WIDTH,
        },
      })

      ignoreListAnonymousStackFramesIfSandwiched(result)

      return middlewareResponse.json(res, result)
    } else if (pathname === '/__nextjs_launch-editor') {
      const isAppRelativePath = searchParams.get('isAppRelativePath') === '1'

      let openEditorResult
      if (isAppRelativePath) {
        const relativeFilePath = searchParams.get('file') || ''
        const appPath = path.join(
          isSrcDir ? 'src' : '',
          'app',
          relativeFilePath
        )
        openEditorResult = await openFileInEditor(appPath, 1, 1, projectPath)
      } else {
        const frame = createStackFrame(searchParams)
        if (!frame) return middlewareResponse.badRequest(res)
        openEditorResult = await openFileInEditor(
          frame.file,
          frame.line ?? 1,
          frame.column ?? 1,
          projectPath
        )
      }

      if (openEditorResult.error) {
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
      return middlewareResponse.badRequest(res)
    }

    let nativeSourceMap: SourceMap | undefined
    try {
      nativeSourceMap = findSourceMap(filename)
    } catch (cause) {
      return middlewareResponse.internalServerError(
        res,
        new Error(
          `${filename}: Invalid source map. Only conformant source maps can be used to find the original code.`,
          { cause }
        )
      )
    }

    if (nativeSourceMap !== undefined) {
      const sourceMapPayload = nativeSourceMap.payload
      return middlewareResponse.json(res, sourceMapPayload)
    }

    try {
      // Turbopack chunk filenames might be URL-encoded.
      filename = decodeURI(filename)
    } catch {
      return middlewareResponse.badRequest(res)
    }

    if (path.isAbsolute(filename)) {
      filename = pathToFileURL(filename).href
    }

    try {
      const sourceMapString = await project.getSourceMap(filename)

      if (sourceMapString) {
        return middlewareResponse.jsonString(res, sourceMapString)
      }
    } catch (cause) {
      return middlewareResponse.internalServerError(
        res,
        new Error(
          `Failed to get source map for '${filename}'. This is a bug in Next.js`,
          {
            cause,
          }
        )
      )
    }

    middlewareResponse.noContent(res)
  }
}

/**
 * Prefix of the on-demand source-content dev endpoint. Defined in `../lib/source-maps` (the
 * neutral home shared with `patch-error-inspect`) and re-exported here for the dev middleware and
 * hot-reloader that consume it.
 */
export const SOURCE_CONTENT_MIDDLEWARE_PREFIX = SOURCE_CONTENT_ENDPOINT_PREFIX

export function getSourceContentMiddleware(project: Project) {
  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const { pathname } = new URL(req.url!, 'http://n')

    if (!pathname.startsWith(SOURCE_CONTENT_MIDDLEWARE_PREFIX)) {
      return next()
    }

    // The relative project path follows the `[project]/` marker. It is URL-encoded by the browser;
    // our internal filesystem paths are POSIX-like and unencoded, so decode before resolving.
    const encodedPath = pathname.slice(SOURCE_CONTENT_MIDDLEWARE_PREFIX.length)
    let filePath: string
    try {
      filePath = decodeURIComponent(encodedPath)
    } catch {
      return middlewareResponse.badRequest(res)
    }

    if (!filePath) {
      return middlewareResponse.badRequest(res)
    }

    try {
      // The native endpoint is gated by the emitted-source-paths admission filter and sandboxed to
      // the project root, so it returns null for files not referenced by a source map or for any
      // path-traversal attempt.
      const content = await project.getSourceContent(filePath)

      if (content !== null) {
        return middlewareResponse.text(res, content)
      }
    } catch {
      // Reading source is race-condition prone (the file may have changed/been deleted). Treat any
      // failure as "not available" rather than surfacing a 500 to devtools.
    }

    middlewareResponse.noContent(res)
  }
}

export async function getOriginalStackFrames({
  project,
  projectPath,
  frames,
  isServer,
  isEdgeServer,
  isAppDirectory,
  codeFrameOptions,
}: {
  project: Project
  projectPath: string
  frames: readonly StackFrame[]
  isServer: boolean
  isEdgeServer: boolean
  isAppDirectory: boolean
  codeFrameOptions?: CodeFrameOptions
}): Promise<OriginalStackFramesResponse> {
  const stackFrames = createStackFrames({
    frames,
    isServer,
    isEdgeServer,
    isAppDirectory,
  })

  return Promise.all(
    stackFrames.map(async (frame) => {
      try {
        const stackFrame = await createOriginalStackFrame(
          project,
          projectPath,
          frame,
          codeFrameOptions
        )
        if (stackFrame === null) {
          return {
            status: 'rejected',
            reason: 'Failed to create original stack frame',
          }
        }
        const originalStackFrame = stackFrame.originalStackFrame
        return {
          status: 'fulfilled',
          value: {
            originalStackFrame,
            originalCodeFrame:
              (originalStackFrame?.ignored ?? true)
                ? null
                : // TODO: Don't get all codeframes of non-ignored frames eagerly.
                  stackFrame.originalCodeFrame,
          },
        }
      } catch (error) {
        return {
          status: 'rejected',
          reason: inspect(error, { colors: false }),
        }
      }
    })
  )
}
