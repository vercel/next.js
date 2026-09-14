import * as path from 'path'
import * as url from 'url'
import type * as util from 'util'
import { SourceMapConsumer as SyncSourceMapConsumer } from 'next/dist/compiled/source-map'
import {
  type ModernSourceMapPayload,
  devirtualizeReactServerURL,
  findApplicableSourceMapPayload,
  findSourceMapPayload,
  ignoreListAnonymousStackFramesIfSandwiched as ignoreListAnonymousStackFramesIfSandwichedGeneric,
  sourceMapIgnoreListsEverything,
} from './lib/source-maps'
import { parseStack, type StackFrame } from './lib/parse-stack'
import type { IgnorableStackFrame } from '../next-devtools/server/shared'
import { workUnitAsyncStorage } from './app-render/work-unit-async-storage.external'
import { dim, italic } from '../lib/picocolors'

type FindSourceMapPayload = (
  sourceURL: string
) => ModernSourceMapPayload | undefined
// Find a source map using the bundler's API.
// This is only a fallback for when Node.js fails to due to bugs e.g. https://github.com/nodejs/node/issues/52102
// TODO: Remove once all supported Node.js versions are fixed.
// TODO(veil): Set from Webpack as well
//
// Stored on `globalThis` for the same reason as the code frame renderer below:
// this module is bundled into several runtimes that each get their own copy,
// and the copy that installs the implementation is not necessarily the one that
// symbolicates a frame. The dev validation worker depends on that, because it
// installs its implementation from the worker bundle while the frames are
// symbolicated by the app-page bundle's copy.
const BUNDLER_FIND_SOURCE_MAP = Symbol.for('next.dev.bundlerFindSourceMap')
type GlobalWithBundlerFindSourceMap = typeof globalThis & {
  [BUNDLER_FIND_SOURCE_MAP]?: FindSourceMapPayload
}

export function setBundlerFindSourceMapImplementation(
  findSourceMapImplementation: FindSourceMapPayload
): void {
  ;(globalThis as GlobalWithBundlerFindSourceMap)[BUNDLER_FIND_SOURCE_MAP] =
    findSourceMapImplementation
}

function bundlerFindSourceMapPayload(
  sourceURL: string
): ModernSourceMapPayload | undefined {
  return (globalThis as GlobalWithBundlerFindSourceMap)[
    BUNDLER_FIND_SOURCE_MAP
  ]?.(sourceURL)
}

// Code frame renderer - injected by dev/build to avoid hard dependency on native bindings
type CodeFrameRenderer = (
  frame: IgnorableStackFrame,
  source: string | null,
  colors: boolean
) => string | null

// The code-frame renderer is stored on `globalThis` rather than in a module
// variable because this module is bundled into several runtimes (the dev
// server, the app-page runtime bundle, and the dev worker bundles) that each
// get their own copy. `Error.prepareStackTrace` is a single process-global, so
// whichever copy patched it last is the one that renders errors, which may not
// be the copy `setCodeFrameRenderer` was called on. Sharing the renderer
// through a `globalThis` symbol lets any copy install it and any copy read it.
const CODE_FRAME_RENDERER = Symbol.for('next.dev.codeFrameRenderer')
type GlobalWithCodeFrameRenderer = typeof globalThis & {
  [CODE_FRAME_RENDERER]?: CodeFrameRenderer
}

export function setCodeFrameRenderer(renderer: CodeFrameRenderer): void {
  ;(globalThis as GlobalWithCodeFrameRenderer)[CODE_FRAME_RENDERER] = renderer
}

function getOriginalCodeFrame(
  frame: IgnorableStackFrame,
  source: string | null,
  colors: boolean = process.stdout.isTTY
): string | null {
  const codeFrameRenderer = (globalThis as GlobalWithCodeFrameRenderer)[
    CODE_FRAME_RENDERER
  ]
  if (!codeFrameRenderer) {
    // No renderer available - gracefully degrade
    return null
  }
  return codeFrameRenderer(frame, source, colors)
}

type SourceMapCache = Map<
  string,
  null | { map: SyncSourceMapConsumer; payload: ModernSourceMapPayload }
>

// Constructing a consumer indexes the whole payload — expensive for large
// chunk maps and previously paid per frame — so consumers are shared across
// all frames and errors whose lookups returned the same payload. The inner
// key is the URL the consumer resolves relative `sources` against.
const sourceMapConsumers = new WeakMap<
  ModernSourceMapPayload,
  Map<string, SyncSourceMapConsumer>
>()

function getOrCreateSourceMapConsumer(
  payload: ModernSourceMapPayload,
  sourceMapURL: string
): SyncSourceMapConsumer {
  let consumersByURL = sourceMapConsumers.get(payload)
  let consumer = consumersByURL?.get(sourceMapURL)
  if (consumer === undefined) {
    consumer = new SyncSourceMapConsumer(
      payload,
      // @ts-expect-error: our typings don't include this parameter but it is here.
      sourceMapURL
    )
    if (consumersByURL === undefined) {
      consumersByURL = new Map()
      // Throws for payloads that aren't objects; those are invalid source
      // maps anyway, and the caller reports them.
      sourceMapConsumers.set(payload, consumersByURL)
    }
    consumersByURL.set(sourceMapURL, consumer)
  }
  return consumer
}

function frameToString(
  methodName: string | null,
  sourceURL: string | null,
  line1: number | null,
  column1: number | null
): string {
  let sourceLocation = line1 !== null ? `:${line1}` : ''
  if (column1 !== null && sourceLocation !== '') {
    sourceLocation += `:${column1}`
  }

  let fileLocation: string | null
  if (
    sourceURL !== null &&
    sourceURL.startsWith('file://') &&
    URL.canParse(sourceURL)
  ) {
    // If not relative to CWD, the path is ambiguous to IDEs and clicking will prompt to select the file first.
    // In a multi-app repo, this leads to potentially larger file names but will make clicking snappy.
    // There's no tradeoff for the cases where `dir` in `next dev [dir]` is omitted
    // since relative to cwd is both the shortest and snappiest.
    fileLocation = path.relative(process.cwd(), url.fileURLToPath(sourceURL))
  } else if (sourceURL !== null && sourceURL.startsWith('/')) {
    fileLocation = path.relative(process.cwd(), sourceURL)
  } else {
    fileLocation = sourceURL
  }

  return methodName
    ? `    at ${methodName} (${fileLocation}${sourceLocation})`
    : `    at ${fileLocation}${sourceLocation}`
}

function computeErrorName(error: Error): string {
  // TODO: Node.js seems to use a different algorithm
  // class ReadonlyRequestCookiesError extends Error {}` would read `ReadonlyRequestCookiesError: [...]`
  // in the stack i.e. seems like under certain conditions it favors the constructor name.
  return error.name || 'Error'
}

function prepareUnsourcemappedStackTrace(
  error: Error,
  structuredStackTrace: any[]
): string {
  const name = computeErrorName(error)
  const message = error.message || ''
  let stack = name + ': ' + message
  for (let i = 0; i < structuredStackTrace.length; i++) {
    stack += '\n    at ' + structuredStackTrace[i].toString()
  }
  return stack
}

function shouldIgnoreListGeneratedFrame(file: string): boolean {
  return file.startsWith('node:') || file.includes('node_modules')
}

function shouldIgnoreListOriginalFrame(file: string): boolean {
  return file.includes('node_modules')
}

interface SourcemappableStackFrame extends StackFrame {
  file: NonNullable<StackFrame['file']>
}

interface SourceMappedFrame {
  stack: IgnorableStackFrame
  // DEV only
  code: string | null
}

function createUnsourcemappedFrame(
  frame: SourcemappableStackFrame
): SourceMappedFrame {
  return {
    stack: {
      file: frame.file,
      line1: frame.line1,
      column1: frame.column1,
      methodName: frame.methodName,
      arguments: frame.arguments,
      ignored: shouldIgnoreListGeneratedFrame(frame.file),
    },
    code: null,
  }
}

function ignoreListAnonymousStackFramesIfSandwiched(
  sourceMappedFrames: Array<{
    stack: IgnorableStackFrame
    code: string | null
  }>
) {
  return ignoreListAnonymousStackFramesIfSandwichedGeneric(
    sourceMappedFrames,
    (frame) => frame.stack.file === '<anonymous>',
    (frame) => frame.stack.ignored,
    (frame) => frame.stack.methodName,
    (frame) => {
      frame.stack.ignored = true
    }
  )
}

/**
 * @param frame
 * @param sourceMapCache
 * @returns The original frame if not sourcemapped.
 */
function getSourcemappedFrameIfPossible(
  frame: SourcemappableStackFrame,
  sourceMapCache: SourceMapCache,
  inspectOptions: util.InspectOptions
): {
  stack: IgnorableStackFrame
  code: string | null
} {
  const sourceMapCacheEntry = sourceMapCache.get(frame.file)
  let sourceMapConsumer: SyncSourceMapConsumer
  let sourceMapPayload: ModernSourceMapPayload
  if (sourceMapCacheEntry === undefined) {
    // Fake frame scripts (`about://React/Server/file:///path/to/chunk.js?42`)
    // have their positions padded to match the underlying chunk, so they
    // resolve via the chunk's source map.
    let sourceURL = devirtualizeReactServerURL(frame.file)
    // e.g. "/Users/foo/APP/.next/server/chunks/ssr/[root-of-the-server]__2934a0._.js"
    // or "C:\Users\foo\APP\.next\server\chunks\ssr\[root-of-the-server]__2934a0._.js"
    // will be keyed by Node.js as "file:///APP/.next/server/chunks/ssr/[root-of-the-server]__2934a0._.js".
    // This is likely caused by `callsite.toString()` in `Error.prepareStackTrace converting file URLs to paths.
    //
    // But frame.file might also be "webpack-internal:///(rsc)/./app/bad-sourcemap/page.js" or
    // "<anonymous>" or "node:internal/process/task_queues" here
    if (path.isAbsolute(sourceURL)) {
      sourceURL = url.pathToFileURL(sourceURL).toString()
    }
    let maybeSourceMapPayload: ModernSourceMapPayload | undefined
    try {
      maybeSourceMapPayload = findSourceMapPayload(sourceURL)

      if (
        maybeSourceMapPayload === undefined &&
        sourceURL.startsWith('file://')
      ) {
        // Devirtualizing React's fake frame URL decodes the path, while Node.js
        // keys its source map cache by the `pathToFileURL` encoding of the same
        // path, so a path containing characters that encoding escapes (such as
        // the brackets in Turbopack's `[root-of-the-server]` chunks) misses
        // above. Node.js also accepts the plain path, which is unambiguous for
        // both interpretations, so retry with that before giving up.
        //
        // TODO(veil): Making React's fake frame URLs reversible, as proposed in
        // https://github.com/react/react/pull/37105, would let the first lookup
        // succeed on its own and retire this retry.
        maybeSourceMapPayload = findSourceMapPayload(
          url.fileURLToPath(sourceURL)
        )
      }
    } catch (cause) {
      // We should not log an actual error instance here because that will re-enter
      // this codepath during error inspection and could lead to infinite recursion.
      console.error(
        `${sourceURL}: Invalid source map. Only conformant source maps can be used to find the original code. Cause: ${cause}`
      )
      // If loading fails once, it'll fail every time.
      // So set the cache to avoid duplicate errors.
      sourceMapCache.set(frame.file, null)
      // Don't even fall back to the bundler because it might be not as strict
      // with regards to parsing and then we fail later once we consume the
      // source map payload.
      // This essentially avoids a redundant error where we fail here and then
      // later on consumption because the bundler just handed back an invalid
      // source map.
      return createUnsourcemappedFrame(frame)
    }
    if (maybeSourceMapPayload === undefined) {
      maybeSourceMapPayload = bundlerFindSourceMapPayload(sourceURL)
    }

    if (maybeSourceMapPayload === undefined) {
      return createUnsourcemappedFrame(frame)
    }
    sourceMapPayload = maybeSourceMapPayload
    try {
      // Pass the source map URL as the second parameter so that the consumer
      // can resolve relative paths in the source map's `sources` array. This is
      // a guess! Turbopack places .map files as siblings to the chunks so this
      // is sufficient to compute relative paths but is actually wrong (the
      // chunk and sourcemap have different content hashes). We are using the
      // node API to read the sourcemap and it doesn't give us access to the
      // URI. `sourceURL` is already devirtualized so that relative `sources`
      // resolve against the real chunk URL, not React's virtual one.
      const sourceMapURL = sourceURL + '.map'
      sourceMapConsumer = getOrCreateSourceMapConsumer(
        sourceMapPayload,
        sourceMapURL
      )
    } catch (cause) {
      // We should not log an actual error instance here because that will re-enter
      // this codepath during error inspection and could lead to infinite recursion.
      console.error(
        `${sourceURL}: Invalid source map. Only conformant source maps can be used to find the original code. Cause: ${cause}`
      )
      // If creating the consumer fails once, it'll fail every time.
      // So set the cache to avoid duplicate errors.
      sourceMapCache.set(frame.file, null)
      return createUnsourcemappedFrame(frame)
    }
    sourceMapCache.set(frame.file, {
      map: sourceMapConsumer,
      payload: sourceMapPayload,
    })
  } else if (sourceMapCacheEntry === null) {
    // We failed earlier getting the payload or consumer.
    // Just return an unsourcemapped frame.
    // Errors will already be logged.
    return createUnsourcemappedFrame(frame)
  } else {
    sourceMapConsumer = sourceMapCacheEntry.map
    sourceMapPayload = sourceMapCacheEntry.payload
  }

  const sourcePosition = sourceMapConsumer.originalPositionFor({
    column: (frame.column1 ?? 1) - 1,
    line: frame.line1 ?? 1,
  })

  const applicableSourceMap = findApplicableSourceMapPayload(
    (frame.line1 ?? 1) - 1,
    (frame.column1 ?? 1) - 1,
    sourceMapPayload
  )
  let ignored =
    applicableSourceMap !== undefined &&
    sourceMapIgnoreListsEverything(applicableSourceMap)
  if (sourcePosition.source === null) {
    return {
      stack: {
        arguments: frame.arguments,
        file: frame.file,
        line1: frame.line1,
        column1: frame.column1,
        methodName: frame.methodName,
        ignored: ignored || shouldIgnoreListGeneratedFrame(frame.file),
      },
      code: null,
    }
  }

  // TODO(veil): Upstream a method to sourcemap consumer that immediately says if a frame is ignored or not.
  if (applicableSourceMap === undefined) {
    console.error('No applicable source map found in sections for frame', frame)
  } else if (!ignored && shouldIgnoreListOriginalFrame(sourcePosition.source)) {
    // Externals may be libraries that don't ship ignoreLists.
    // This is really taking control away from libraries.
    // They should still ship `ignoreList` so that attached debuggers ignore-list their frames.
    // TODO: Maybe only ignore library sourcemaps if `ignoreList` is absent?
    // Though keep in mind that Turbopack omits empty `ignoreList`.
    // So if we establish this convention, we should communicate it to the ecosystem.
    ignored = true
  } else if (!ignored) {
    // TODO: O(n^2). Consider moving `ignoreList` into a Set
    const sourceIndex = applicableSourceMap.sources.indexOf(
      sourcePosition.source
    )
    ignored = applicableSourceMap.ignoreList?.includes(sourceIndex) ?? false
  }

  const originalFrame: IgnorableStackFrame = {
    // We ignore the sourcemapped name since it won't be the correct name.
    // The callsite will point to the column of the variable name instead of the
    // name of the enclosing function.
    // TODO(NDX-531): Spy on prepareStackTrace to get the enclosing line number for method name mapping.
    methodName: frame.methodName
      ?.replace('__WEBPACK_DEFAULT_EXPORT__', 'default')
      ?.replace('__webpack_exports__.', ''),
    file: sourcePosition.source,
    line1: sourcePosition.line,
    column1: sourcePosition.column + 1,
    // TODO: c&p from async createOriginalStackFrame but why not frame.arguments?
    arguments: [],
    ignored,
  }

  /** undefined = not yet computed */
  let codeFrame: string | null | undefined

  return {
    stack: originalFrame,
    get code() {
      if (codeFrame === undefined) {
        const sourceContent: string | null =
          sourceMapConsumer.sourceContentFor(
            sourcePosition.source,
            /* returnNullOnMissing */ true
          ) ?? null
        codeFrame = getOriginalCodeFrame(
          originalFrame,
          sourceContent,
          inspectOptions.colors
        )
      }
      return codeFrame
    },
  }
}

function parseAndSourceMap(
  error: Error,
  inspectOptions: util.InspectOptions
): string {
  const showIgnoreListed = process.env.__NEXT_SHOW_IGNORE_LISTED === 'true'
  // We overwrote Error.prepareStackTrace earlier so error.stack is not sourcemapped.
  let unparsedStack = String(error.stack)
  // We could just read it from `error.stack`.
  // This works around cases where a 3rd party `Error.prepareStackTrace` implementation
  // doesn't implement the name computation correctly.
  const errorName = computeErrorName(error)

  let idx = unparsedStack.indexOf('react_stack_bottom_frame')
  if (idx !== -1) {
    idx = unparsedStack.lastIndexOf('\n', idx)
  } else {
    idx = unparsedStack.indexOf('react-stack-bottom-frame')
    if (idx !== -1) {
      idx = unparsedStack.lastIndexOf('\n', idx)
    }
  }
  if (idx !== -1 && !showIgnoreListed) {
    // Cut off everything after the bottom frame since it'll be React internals.
    unparsedStack = unparsedStack.slice(0, idx)
  }

  const unsourcemappedStack = parseStack(unparsedStack)
  const sourceMapCache: SourceMapCache = new Map()

  const sourceMappedFrames: Array<{
    stack: IgnorableStackFrame
    code: string | null
  }> = []
  let sourceFrame: null | string = null
  for (const frame of unsourcemappedStack) {
    if (frame.file === null) {
      sourceMappedFrames.push({
        code: null,
        stack: {
          file: frame.file,
          line1: frame.line1,
          column1: frame.column1,
          methodName: frame.methodName,
          arguments: frame.arguments,
          ignored: false,
        },
      })
    } else {
      const sourcemappedFrame = getSourcemappedFrameIfPossible(
        // We narrowed this earlier by bailing if `frame.file` is null.
        frame as SourcemappableStackFrame,
        sourceMapCache,
        inspectOptions
      )
      sourceMappedFrames.push(sourcemappedFrame)

      // We can determine the sourceframe here.
      // anonymous frames won't have a sourceframe so we don't need to scan
      // all stacks again to check if they are sandwiched between ignored frames.
      if (
        sourceFrame === null &&
        // TODO: Is this the right choice?
        !sourcemappedFrame.stack.ignored &&
        sourcemappedFrame.code !== null
      ) {
        sourceFrame = sourcemappedFrame.code
      }
    }
  }

  ignoreListAnonymousStackFramesIfSandwiched(sourceMappedFrames)

  let sourceMappedStack = ''
  for (let i = 0; i < sourceMappedFrames.length; i++) {
    const frame = sourceMappedFrames[i]

    if (!frame.stack.ignored) {
      sourceMappedStack +=
        '\n' +
        frameToString(
          frame.stack.methodName,
          frame.stack.file,
          frame.stack.line1,
          frame.stack.column1
        )
    } else if (showIgnoreListed) {
      sourceMappedStack +=
        '\n' +
        dim(
          frameToString(
            frame.stack.methodName,
            frame.stack.file,
            frame.stack.line1,
            frame.stack.column1
          )
        )
    }
  }

  if (sourceMappedStack === '' && sourceMappedFrames.length > 0) {
    // The `at` marker is important so that Node.js doesn't add square brackets
    // around the stringified error i.e. this results in
    // Error: message
    //   at <ignore-listed frames>
    // instead of
    // [Error: message
    //   at <ignore-listed frames>]
    sourceMappedStack = '\n    at ' + italic('ignore-listed frames')
  }

  return (
    errorName +
    ': ' +
    error.message +
    sourceMappedStack +
    (sourceFrame !== null ? '\n' + sourceFrame : '')
  )
}

function sourceMapError(
  this: void,
  error: Error,
  inspectOptions: util.InspectOptions
): Error {
  // Setting an undefined `cause` would print `[cause]: undefined`
  const options = error.cause !== undefined ? { cause: error.cause } : undefined

  // Create a new Error object with the source mapping applied and then use native
  // Node.js formatting on the result.
  const newError =
    error instanceof AggregateError
      ? // Preserve AggregateError's `errors` instance property
        new AggregateError(error.errors, error.message, options)
      : new Error(error.message, options)

  // TODO: Ensure `class MyError extends Error {}` prints `MyError` as the name
  newError.stack = parseAndSourceMap(error, inspectOptions)

  for (const key in error) {
    if (!Object.prototype.hasOwnProperty.call(newError, key)) {
      // @ts-expect-error -- We're copying all enumerable properties.
      // So they definitely exist on `this` and obviously have no type on `newError` (yet)
      newError[key] = error[key]
    }
  }

  return newError
}

/**
 * Node.js passes the remaining depth in `depth`. An `AggregateError` keeps its
 * errors in an array. Node.js spends one level of the depth on that array, and
 * one more level on each error in the array. A `cause` costs one level only.
 * This function adds the missing level back, so an `AggregateError` prints its
 * errors at the same nesting as a `cause`. Without it, a `fetch` failure logs
 * `[errors]: [ [Error], [Error] ]` and hides the address and the port of every
 * refused connection.
 *
 * A `depth` of `null` means unlimited, so this function returns it unchanged.
 */
function getInspectDepth(error: Error, depth: number | null): number | null {
  if (depth === null || !(error instanceof AggregateError)) {
    return depth
  }

  return depth + 1
}

export function patchErrorInspectNodeJS(
  errorConstructor: ErrorConstructor
): void {
  const inspectSymbol = Symbol.for('nodejs.util.inspect.custom')

  errorConstructor.prepareStackTrace = prepareUnsourcemappedStackTrace

  // @ts-expect-error -- TODO upstream types
  errorConstructor.prototype[inspectSymbol] = function (
    depth: number | null,
    inspectOptions: util.InspectOptions,
    inspect: typeof util.inspect
  ): string {
    // avoid false-positive dynamic i/o warnings e.g. due to usage of `Math.random` in `source-map`.
    return workUnitAsyncStorage.exit(() => {
      const newError = sourceMapError(this, inspectOptions)

      const originalCustomInspect = (newError as any)[inspectSymbol]
      // Prevent infinite recursion.
      // { customInspect: false } would result in `error.cause` not using our inspect.
      Object.defineProperty(newError, inspectSymbol, {
        value: undefined,
        enumerable: false,
        writable: true,
      })
      try {
        return inspect(newError, {
          ...inspectOptions,
          depth: getInspectDepth(newError, depth),
        })
      } finally {
        ;(newError as any)[inspectSymbol] = originalCustomInspect
      }
    })
  }
}

export function patchErrorInspectEdgeLite(
  errorConstructor: ErrorConstructor
): void {
  const inspectSymbol = Symbol.for('edge-runtime.inspect.custom')

  errorConstructor.prepareStackTrace = prepareUnsourcemappedStackTrace

  // @ts-expect-error -- TODO upstream types
  errorConstructor.prototype[inspectSymbol] = function ({
    format,
  }: {
    format: (...args: unknown[]) => string
  }): string {
    // avoid false-positive dynamic i/o warnings e.g. due to usage of `Math.random` in `source-map`.
    return workUnitAsyncStorage.exit(() => {
      const newError = sourceMapError(this, {})

      const originalCustomInspect = (newError as any)[inspectSymbol]
      // Prevent infinite recursion.
      Object.defineProperty(newError, inspectSymbol, {
        value: undefined,
        enumerable: false,
        writable: true,
      })
      try {
        return format(newError)
      } finally {
        ;(newError as any)[inspectSymbol] = originalCustomInspect
      }
    })
  }
}
