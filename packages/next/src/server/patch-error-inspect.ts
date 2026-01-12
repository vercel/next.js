import * as fs from 'fs'
import { findSourceMap as nativeFindSourceMap } from 'module'
import * as path from 'path'
import * as url from 'url'
import type * as util from 'util'
import { SourceMapConsumer as SyncSourceMapConsumer } from 'next/dist/compiled/source-map'
import {
  type ModernSourceMapPayload,
  findApplicableSourceMapPayload,
  ignoreListAnonymousStackFramesIfSandwiched as ignoreListAnonymousStackFramesIfSandwichedGeneric,
  sourceMapIgnoreListsEverything,
} from './lib/source-maps'
import { parseStack, type StackFrame } from './lib/parse-stack'
import { getOriginalCodeFrame } from '../next-devtools/server/shared'
import { workUnitAsyncStorage } from './app-render/work-unit-async-storage.external'
import { dim, italic } from '../lib/picocolors'

/**
 * V8 CallSite interface - we only need toString() and enclosing position methods.
 * @see https://v8.dev/docs/stack-trace-api
 */
interface CallSite {
  toString(): string
  // V8-specific methods for getting enclosing function location.
  // These may not be available in all runtimes (e.g., Bun).
  getEnclosingLineNumber?(): number | null
  getEnclosingColumnNumber?(): number | null
}

/**
 * Enclosing function position for a stack frame.
 * Used for looking up original function names in source maps.
 */
interface EnclosingPosition {
  /** 1-indexed line number where the enclosing function is defined */
  line: number
  /** 1-indexed column number where the enclosing function is defined */
  column: number
}

/**
 * Captured enclosing positions from V8 CallSite objects, keyed by Error.
 * Positions are stored by frame index to correlate with parsed stack frames.
 */
const capturedEnclosingPositions = new WeakMap<
  Error,
  Array<EnclosingPosition | null>
>()

type FindSourceMapPayload = (
  sourceURL: string
) => ModernSourceMapPayload | undefined
// Find a source map using the bundler's API.
// This is only a fallback for when Node.js fails to due to bugs e.g. https://github.com/nodejs/node/issues/52102
// TODO: Remove once all supported Node.js versions are fixed.
// TODO(veil): Set from Webpack as well
let bundlerFindSourceMapPayload: FindSourceMapPayload = () => undefined

export function setBundlerFindSourceMapImplementation(
  findSourceMapImplementation: FindSourceMapPayload
): void {
  bundlerFindSourceMapPayload = findSourceMapImplementation
}

interface IgnorableStackFrame extends StackFrame {
  ignored: boolean
}

/**
 * Name mappings indexed by generated line number.
 * Each entry is an array of {column, name} sorted by column.
 */
type NameMappingsByLine = Map<number, Array<{ column: number; name: string }>>

/**
 * Source map cache entry with optional name mappings and generated source.
 */
interface SourceMapCacheEntry {
  map: SyncSourceMapConsumer
  payload: ModernSourceMapPayload
  /** Cached name mappings for efficient lookup */
  nameMappings?: NameMappingsByLine
  /** Cached generated source file content for name validation */
  generatedSource?: string | null
  /** File name (URL) for reading generated source */
  fileName: string
}

type SourceMapCache = Map<string, null | SourceMapCacheEntry>

/**
 * Lazily get the generated source content from a cache entry.
 */
function getGeneratedSource(entry: SourceMapCacheEntry): string | null {
  if (entry.generatedSource === undefined) {
    try {
      let filePath = entry.fileName
      if (filePath.startsWith('file://')) {
        filePath = url.fileURLToPath(filePath)
      } else if (!path.isAbsolute(filePath)) {
        // Can't read non-file URLs (webpack-internal://, etc.)
        entry.generatedSource = null
        return null
      }
      entry.generatedSource = fs.readFileSync(filePath, 'utf-8')
    } catch {
      entry.generatedSource = null
    }
  }
  return entry.generatedSource
}

/**
 * Get the offset of a specific line in the source without creating a substring.
 */
function getLineOffset(source: string, line: number): number {
  if (line < 1) return -1
  let currentLine = 1
  let lineStart = 0
  while (currentLine < line) {
    const nextNewline = source.indexOf('\n', lineStart)
    if (nextNewline === -1) return -1
    lineStart = nextNewline + 1
    currentLine++
  }
  return lineStart
}

/**
 * Check if a function name exists at a given position in source code.
 * Function names must be followed by '(', '=', ':', or whitespace.
 */
function isFunctionNameAtPosition(
  source: string,
  line: number,
  column: number,
  name: string
): boolean {
  const lineOffset = getLineOffset(source, line)
  if (lineOffset === -1) return false
  const pos = lineOffset + column
  if (!source.startsWith(name, pos)) return false
  const endPos = pos + name.length
  return endPos < source.length && /[(=:\s]/.test(source[endPos])
}

/**
 * Lazily build and cache name mappings from a source map.
 */
function getNameMappings(entry: SourceMapCacheEntry): NameMappingsByLine {
  if (!entry.nameMappings) {
    const nameMappings: NameMappingsByLine = new Map()
    try {
      entry.map.eachMapping((mapping) => {
        if (!mapping.name) return
        let lineEntries = nameMappings.get(mapping.generatedLine)
        if (!lineEntries) {
          lineEntries = []
          nameMappings.set(mapping.generatedLine, lineEntries)
        }
        lineEntries.push({
          column: mapping.generatedColumn,
          name: mapping.name,
        })
      })
      for (const entries of nameMappings.values()) {
        entries.sort((a, b) => a.column - b.column)
      }
    } catch {
      // Some source maps may have invalid internal state - return empty mappings
      nameMappings.clear()
    }
    entry.nameMappings = nameMappings
  }
  return entry.nameMappings
}

/**
 * Find a valid original function name near the given enclosing position.
 * Only searches forward since V8's enclosing position points to the start
 * of the function definition (async/function keyword).
 */
function findNameAtPosition(
  nameMappings: NameMappingsByLine,
  line: number,
  column: number,
  generatedSource: string | null,
  mangledName: string | undefined
): string | undefined {
  const lineEntries = nameMappings.get(line) ?? []

  // Without generated source, we can't validate - don't use source map names
  if (!generatedSource || !mangledName) return undefined

  // Only search forward, typical distance: "async function " = 15 chars
  const maxForwardDistance = 16

  // Binary search for first entry at or after column
  let startIdx = 0
  let endIdx = lineEntries.length
  while (startIdx < endIdx) {
    const mid = (startIdx + endIdx) >> 1
    if (lineEntries[mid].column < column) {
      startIdx = mid + 1
    } else {
      endIdx = mid
    }
  }

  // Check the first entry at or after the enclosing position
  if (startIdx < lineEntries.length) {
    const entry = lineEntries[startIdx]
    if (
      entry.column >= column &&
      entry.column - column < maxForwardDistance &&
      isFunctionNameAtPosition(generatedSource, line, entry.column, mangledName)
    ) {
      return entry.name
    }
  }

  return undefined
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
  structuredStackTrace: CallSite[]
): string {
  const name = computeErrorName(error)
  const message = error.message || ''

  // Capture enclosing positions for later use in name deobfuscation.
  // These V8-specific APIs give us the position where the enclosing function
  // is defined, which we can use to look up original function names in source maps.
  const positions = structuredStackTrace.map((callSite) => {
    const line = callSite.getEnclosingLineNumber?.()
    const column = callSite.getEnclosingColumnNumber?.()
    if (line != null && column != null) {
      return { line, column }
    }
    return null
  })
  capturedEnclosingPositions.set(error, positions)

  // Use V8's native formatting (unchanged behavior)
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
 * @param inspectOptions
 * @param enclosingPosition - Optional enclosing function position for name deobfuscation
 * @returns The original frame if not sourcemapped.
 */
function getSourcemappedFrameIfPossible(
  frame: SourcemappableStackFrame,
  sourceMapCache: SourceMapCache,
  inspectOptions: util.InspectOptions,
  enclosingPosition: EnclosingPosition | null
): {
  stack: IgnorableStackFrame
  code: string | null
} {
  let sourceMapCacheEntry = sourceMapCache.get(frame.file)
  let sourceMapConsumer: SyncSourceMapConsumer
  let sourceMapPayload: ModernSourceMapPayload
  if (sourceMapCacheEntry === undefined) {
    let sourceURL = frame.file
    // e.g. "/Users/foo/APP/.next/server/chunks/ssr/[root-of-the-server]__2934a0._.js"
    // or "C:\Users\foo\APP\.next\server\chunks\ssr\[root-of-the-server]__2934a0._.js"
    // will be keyed by Node.js as "file:///APP/.next/server/chunks/ssr/[root-of-the-server]__2934a0._.js".
    // This is likely caused by `callsite.toString()` in `Error.prepareStackTrace converting file URLs to paths.
    //
    // But frame.file might also be "webpack-internal:///(rsc)/./app/bad-sourcemap/page.js" or
    // "<anonymous>" or "node:internal/process/task_queues" here
    if (path.isAbsolute(frame.file)) {
      sourceURL = url.pathToFileURL(frame.file).toString()
    }
    let maybeSourceMapPayload: ModernSourceMapPayload | undefined
    try {
      const sourceMap = nativeFindSourceMap(sourceURL)
      maybeSourceMapPayload = sourceMap?.payload
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
      // can resolve relative paths in the source map's `sources` array.
      // This is a guess!  Turbopack places .map files as siblings to the chunks so this is sufficient to compute
      // relative paths but is actually wrong (the chunk and sourcemap have different content hashes).
      // We are using the node API to read the sourcemap and it doesn't give us access to the URI.
      const sourceMapURL = sourceURL + '.map'
      sourceMapConsumer = new SyncSourceMapConsumer(
        sourceMapPayload,
        // @ts-expect-error: our typings don't include this parameter but it is here.
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
    sourceMapCacheEntry = {
      map: sourceMapConsumer,
      payload: sourceMapPayload,
      fileName: sourceURL,
    }
    sourceMapCache.set(frame.file, sourceMapCacheEntry)
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

  // Try to deobfuscate the method name using the enclosing function position
  let methodName = frame.methodName
    ?.replace('__WEBPACK_DEFAULT_EXPORT__', 'default')
    ?.replace('__webpack_exports__.', '')

  if (enclosingPosition && sourceMapCacheEntry && methodName) {
    // Parse the methodName to extract components for reconstruction
    // Format: [async] [new] [TypeName.]functionName[ [as methodName]]
    let prefix = ''
    let remaining = methodName

    // Extract "async " prefix
    if (remaining.startsWith('async ')) {
      prefix += 'async '
      remaining = remaining.slice(6)
    }
    // Extract "new " prefix
    if (remaining.startsWith('new ')) {
      prefix += 'new '
      remaining = remaining.slice(4)
    }

    // Extract " [as methodName]" suffix
    // Note: We keep the [as methodName] suffix unchanged since we can't
    // deobfuscate property names - the enclosing position only tells us
    // where the function is defined, not where it's accessed
    let asSuffix = ''
    const asIndex = remaining.indexOf(' [as ')
    if (asIndex !== -1) {
      asSuffix = remaining.slice(asIndex)
      remaining = remaining.slice(0, asIndex)
    }

    // Extract TypeName. prefix (e.g., "Object.foo" -> typeName="Object.", functionName="foo")
    let typePrefix = ''
    const dotIndex = remaining.lastIndexOf('.') // Use lastIndexOf for nested namespaces
    if (dotIndex !== -1) {
      typePrefix = remaining.slice(0, dotIndex + 1)
      remaining = remaining.slice(dotIndex + 1)
    }

    // `remaining` is now the raw function name
    const rawFunctionName = remaining

    const deobfuscatedName = findNameAtPosition(
      getNameMappings(sourceMapCacheEntry),
      enclosingPosition.line,
      enclosingPosition.column - 1, // Convert to 0-indexed
      getGeneratedSource(sourceMapCacheEntry),
      rawFunctionName
    )

    if (deobfuscatedName) {
      // Reconstruct the method name with the deobfuscated function name
      methodName = prefix + typePrefix + deobfuscatedName + asSuffix
    }
  }

  const originalFrame: IgnorableStackFrame = {
    methodName,
    file: sourcePosition.source,
    line1: sourcePosition.line,
    column1: sourcePosition.column + 1,
    // TODO: c&p from async createOriginalStackFrame but why not frame.arguments?
    arguments: [],
    ignored,
  }

  /** undefined = not yet computed*/
  let codeFrame: string | null | undefined

  return Object.defineProperty(
    {
      stack: originalFrame,
      code: null,
    },
    'code',
    {
      get: () => {
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
  )
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

  // Get captured enclosing positions for name deobfuscation
  const enclosingPositions = capturedEnclosingPositions.get(error)

  const sourceMappedFrames: Array<{
    stack: IgnorableStackFrame
    code: string | null
  }> = []
  let sourceFrame: null | string = null
  for (let i = 0; i < unsourcemappedStack.length; i++) {
    const frame = unsourcemappedStack[i]

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
        inspectOptions,
        enclosingPositions?.[i] ?? null
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
  // Create a new Error object with the source mapping applied and then use native
  // Node.js formatting on the result.
  const newError =
    error.cause !== undefined
      ? // Setting an undefined `cause` would print `[cause]: undefined`
        new Error(error.message, { cause: error.cause })
      : new Error(error.message)

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

export function patchErrorInspectNodeJS(
  errorConstructor: ErrorConstructor
): void {
  const inspectSymbol = Symbol.for('nodejs.util.inspect.custom')

  errorConstructor.prepareStackTrace = prepareUnsourcemappedStackTrace

  // @ts-expect-error -- TODO upstream types
  errorConstructor.prototype[inspectSymbol] = function (
    depth: number,
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
          depth:
            (inspectOptions.depth ??
              // Default in Node.js
              2) - depth,
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
