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
 * V8 CallSite interface for structured stack traces.
 * @see https://v8.dev/docs/stack-trace-api
 */
interface CallSite {
  getThis(): unknown
  getTypeName(): string | null
  getFunction(): Function | undefined
  getFunctionName(): string | null
  getMethodName(): string | null
  getFileName(): string | undefined
  getLineNumber(): number | null
  getColumnNumber(): number | null
  getEvalOrigin(): string | undefined
  isToplevel(): boolean
  isEval(): boolean
  isNative(): boolean
  isConstructor(): boolean
  isAsync(): boolean
  isPromiseAll(): boolean
  getPromiseIndex(): number | null
  // V8-specific methods for getting enclosing function location
  // These may not be available in all runtimes (e.g., Bun)
  getEnclosingLineNumber?(): number | null
  getEnclosingColumnNumber?(): number | null
  toString(): string
}

/**
 * Captured stack frame data from V8 CallSite objects.
 * This preserves the structured data so we don't need to parse stack strings later.
 */
interface CapturedFrame {
  /** Function name from getFunctionName() */
  functionName: string | undefined
  /** Method name from getMethodName() (for [as methodName] format) */
  methodName: string | undefined
  /** Type name from getTypeName() for qualified names like "Foo.bar" */
  typeName: string | undefined
  /** File name from getFileName() */
  fileName: string | undefined
  /** Line number of the call site (1-indexed) */
  lineNumber: number | undefined
  /** Column number of the call site (1-indexed) */
  columnNumber: number | undefined
  /** Line number where the enclosing function is defined (1-indexed), V8-specific */
  enclosingLineNumber: number | undefined
  /** Column number where the enclosing function is defined (1-indexed), V8-specific */
  enclosingColumnNumber: number | undefined
  /** Whether this is an async function call */
  isAsync: boolean
  /** Whether this is a constructor call (new Foo()) */
  isConstructor: boolean
  /**
   * Original V8 CallSite.toString() result.
   * Used for unsourcemapped frames to preserve V8's native formatting.
   * Undefined when the frame was reconstructed from a parsed stack string.
   */
  originalString: string | undefined
}

/**
 * Captured stack trace information stored in WeakMap keyed by Error object.
 */
interface CapturedStackTrace {
  /** Error name computed at capture time */
  name: string
  /** Captured frames from CallSite objects */
  frames: CapturedFrame[]
}

/**
 * WeakMap to store captured stack trace data keyed by Error object.
 * This allows us to access the structured CallSite data later during inspection
 * without needing to parse the stack string.
 */
const capturedStackTraces = new WeakMap<Error, CapturedStackTrace>()

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
  /** Cached name mappings for efficient lookup, the SourceMapConsumer doesn't allow random access */
  nameMappings?: NameMappingsByLine
  /** Cached generated source file content for name validation, if `null` then we failed to read the file. */
  generatedSource?: string | null
  /** File name (URL) for reading generated source */
  fileName: string
}

type SourceMapCache = Map<string, null | SourceMapCacheEntry>

/**
 * Parse a stack string into CapturedFrame format.
 *
 * This is used when we fall back to parsing the stack string instead of
 * using V8's structured stack trace (e.g., when errors are serialized
 * across process boundaries during prerendering).
 *
 * Extracts "async " and "new " prefixes from method names and converts
 * them to boolean flags matching the CapturedFrame format.
 */
export function parseFrames(stackString: string): CapturedFrame[] {
  const parsedFrames = parseStack(stackString)
  return parsedFrames.map((frame) => {
    // Extract "async " and "new " prefixes from method name
    let name = frame.methodName ?? ''
    const isAsync = name.startsWith('async ')
    if (isAsync) {
      name = name.slice(6)
    }
    const isConstructor = name.startsWith('new ')
    if (isConstructor) {
      name = name.slice(4)
    }

    // Parse "FunctionName [as methodName]" format (e.g., "eval [as _onTimeout]")
    let functionName: string | undefined
    let methodName: string | undefined
    const asMatch = name.match(/^(.+?) [as (.+)]$/)
    if (asMatch) {
      functionName = asMatch[1] || undefined
      methodName = asMatch[2] || undefined
    } else {
      // Could be just functionName or just methodName - we can't distinguish from parsed stack
      functionName = name || undefined
      methodName = undefined
    }

    return {
      functionName,
      methodName,
      typeName: undefined,
      fileName: frame.file ?? undefined,
      lineNumber: frame.line1 ?? undefined,
      columnNumber: frame.column1 ?? undefined,
      enclosingLineNumber: undefined,
      enclosingColumnNumber: undefined,
      isAsync,
      isConstructor,
      // Parsed frames don't have the original V8 string
      originalString: undefined,
    }
  })
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

  let fileLocation: string
  if (sourceURL === null) {
    // For native functions like JSON.stringify, Set.forEach, etc.
    // V8's CallSite.toString() uses '<anonymous>' for null file names
    fileLocation = '<anonymous>'
  } else if (sourceURL.startsWith('file://') && URL.canParse(sourceURL)) {
    // If not relative to CWD, the path is ambiguous to IDEs and clicking will prompt to select the file first.
    // In a multi-app repo, this leads to potentially larger file names but will make clicking snappy.
    // There's no tradeoff for the cases where `dir` in `next dev [dir]` is omitted
    // since relative to cwd is both the shortest and snappiest.
    fileLocation = path.relative(process.cwd(), url.fileURLToPath(sourceURL))
  } else if (sourceURL.startsWith('/')) {
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

/**
 * Parse an eval origin string to extract file, line, and column.
 * Eval origins look like: "eval at <name> (webpack-internal:///(rsc)/./app/page.tsx:10:5)"
 * or just "(webpack-internal:///(rsc)/./app/page.tsx:10:5)"
 */
function parseEvalOrigin(
  evalOrigin: string | undefined
): { file: string; line: number; column: number } | undefined {
  if (!evalOrigin) return undefined

  // Match the file:line:column pattern at the end, inside parentheses
  const match = evalOrigin.match(/\(([^)]+):(\d+):(\d+)\)$/)
  if (match) {
    return {
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
    }
  }
  return undefined
}

/**
 * Capture a CallSite object into a plain object for later use.
 */
function captureCallSite(callSite: CallSite): CapturedFrame {
  let fileName = callSite.getFileName() ?? undefined
  let lineNumber = callSite.getLineNumber() ?? undefined
  let columnNumber = callSite.getColumnNumber() ?? undefined

  // For eval frames, getFileName() returns undefined but getEvalOrigin() contains the source location.
  // There are two formats:
  // 1. Traditional eval: "eval at <name> (webpack-internal:///.../page.js:10:5)" - extract file:line:col
  // 2. eval-source-map: just "webpack-internal:///.../page.js" (sourceURL in eval'd code) - use as fileName
  //
  // For case 1, we must use the line:col from the eval origin (position in the source file)
  // because getLineNumber/getColumnNumber return positions in the eval'd code which don't map correctly.
  // For case 2, the getLineNumber/getColumnNumber positions ARE correct for source mapping.
  if (fileName === undefined && callSite.isEval()) {
    const evalOrigin = callSite.getEvalOrigin()
    if (evalOrigin) {
      // Check if this is a traditional eval origin with (file:line:col) format
      const parsed = parseEvalOrigin(evalOrigin)
      if (parsed) {
        fileName = parsed.file
        lineNumber = parsed.line
        columnNumber = parsed.column
      } else {
        // evalOrigin is just the sourceURL from eval-source-map
        fileName = evalOrigin
      }
    }
  }

  return {
    functionName: callSite.getFunctionName() ?? undefined,
    methodName: callSite.getMethodName() ?? undefined,
    typeName: callSite.getTypeName() ?? undefined,
    fileName,
    lineNumber,
    columnNumber,
    // These V8-specific methods may not exist in all runtimes (e.g., Bun)
    enclosingLineNumber: callSite.getEnclosingLineNumber?.() ?? undefined,
    enclosingColumnNumber: callSite.getEnclosingColumnNumber?.() ?? undefined,
    isAsync: callSite.isAsync(),
    isConstructor: callSite.isConstructor(),
    // Store V8's native formatting for use when we don't source-map the frame
    originalString: callSite.toString(),
  }
}

function prepareUnsourcemappedStackTrace(
  error: Error,
  structuredStackTrace: CallSite[]
): string {
  const name = computeErrorName(error)
  const message = error.message || ''

  // Capture the structured stack trace data for later source mapping
  const frames = structuredStackTrace.map(captureCallSite)
  capturedStackTraces.set(error, { name, frames })

  let stack = name + ': ' + message
  for (let i = 0; i < structuredStackTrace.length; i++) {
    stack += '\n    at ' + structuredStackTrace[i].toString()
  }
  return stack
}

function shouldIgnoreListGeneratedFrame(file: string): boolean {
  return file.startsWith('node:') || file.includes('node_modules')
}

/**
 * Read the generated source file content.
 * Returns null for non-file URLs (webpack-internal://, etc.) or on read error.
 */
function readGeneratedSource(fileName: string): string | null {
  try {
    // Only read file:// URLs or absolute paths
    let filePath: string
    if (fileName.startsWith('file://')) {
      filePath = url.fileURLToPath(fileName)
    } else if (path.isAbsolute(fileName)) {
      filePath = fileName
    } else {
      // Can't read non-file URLs (webpack-internal://, etc.)
      return null
    }

    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

function shouldIgnoreListOriginalFrame(file: string): boolean {
  return file.includes('node_modules')
}

/**
 * Get the offset of a specific line in the source without creating a substring.
 * Returns -1 if line is out of bounds.
 *
 * @param source - The source code content
 * @param line - Line number (1-indexed)
 * @returns The character offset where the line starts, or -1 if not found
 */
function getLineOffset(source: string, line: number): number {
  if (line < 1) return -1

  let currentLine = 1
  let lineStart = 0

  // Find the start of the requested line
  while (currentLine < line) {
    const nextNewline = source.indexOf('\n', lineStart)
    if (nextNewline === -1) {
      // No more newlines, line doesn't exist
      return -1
    }
    lineStart = nextNewline + 1
    currentLine++
  }

  return lineStart
}

/**
 * Check if a function name exists at a given position in source code.
 *
 * Function names must be followed by one of:
 * - '(' for function calls/declarations
 * - '=' for arrow functions (const foo = ...)
 * - ':' for object methods ({ foo: ... })
 * - whitespace (space, tab, newline, etc.)
 *
 * @param source - The source code content
 * @param line - Line number (1-indexed)
 * @param column - Column number (0-indexed)
 * @param name - The function name to check for
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

  // Check if the name matches at this position
  if (!source.startsWith(name, pos)) {
    return false
  }

  // Check that it's followed by an expected token for function names
  const endPos = pos + name.length
  // Must be followed by '(', '=', ':', or whitespace
  return endPos < source.length && /[(=:\s]/.test(source[endPos])
}

/**
 * Build a cached lookup structure for name mappings from a source map.
 * This allows efficient name lookups without iterating all mappings each time.
 */
function buildNameMappings(
  sourceMapConsumer: SyncSourceMapConsumer
): NameMappingsByLine {
  const nameMappings: NameMappingsByLine = new Map()

  try {
    sourceMapConsumer.eachMapping((mapping) => {
      if (!mapping.name) return

      let lineEntries = nameMappings.get(mapping.generatedLine)
      if (!lineEntries) {
        lineEntries = []
        nameMappings.set(mapping.generatedLine, lineEntries)
      }
      lineEntries.push({ column: mapping.generatedColumn, name: mapping.name })
    })

    // Sort each line's entries by column for efficient searching
    for (const entries of nameMappings.values()) {
      entries.sort((a, b) => a.column - b.column)
    }
  } catch {
    // Some source maps (particularly indexed/sectioned ones) may have invalid
    // internal state that causes eachMapping to fail. Return empty mappings
    // rather than crashing error formatting.
    nameMappings.clear()
  }

  return nameMappings
}

/**
 * Find a valid original function name near the given position on the same line.
 *
 * Only searches FORWARD from the enclosing position since V8's enclosing position
 * always points to the start of the function (async keyword, function keyword, etc.)
 * and the function name is always after that position.
 *
 * Validates by checking the generated source: if the mangled name from the stack
 * frame appears at the mapping position, this is a valid deobfuscation.
 */
function findNameAtPosition(
  nameMappings: NameMappingsByLine,
  line: number,
  column: number,
  generatedSource: string | null,
  mangledName: string | undefined
): string | undefined {
  const lineEntries = nameMappings.get(line)
  if (!lineEntries || lineEntries.length === 0) return undefined

  // If we can't read the generated source, we can't validate - don't use source map names
  if (!generatedSource) return undefined

  // Only search forward from enclosing position - name is always after
  // Typical distance: "async function " = 15 chars, "function " = 9 chars
  const maxForwardDistance = 16

  // lineEntries are already sorted by column from buildNameMappings
  // Find the first entry at or after our column position using binary search
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

  // Iterate from the first candidate forward, stopping when we exceed maxForwardDistance
  for (let i = startIdx; i < lineEntries.length; i++) {
    const entry = lineEntries[i]
    const distance = entry.column - column

    // Since entries are sorted, once we exceed maxForwardDistance we're done
    if (distance > maxForwardDistance) break

    // Validation: check if the mangled name from the stack frame appears at this position
    // If so, the source map name is the original name we should use
    const mappedName = entry.name
    if (mappedName) {
      if (
        mangledName &&
        isFunctionNameAtPosition(
          generatedSource,
          line,
          entry.column,
          mangledName
        )
      ) {
        return mappedName
      }

      // Only check the first named mapping in range - if it doesn't validate, give up
      break
    }
  }

  return undefined
}

/**
 * Resolve the original function name using V8's enclosing function position.
 *
 * This uses the enclosingLineNumber/enclosingColumnNumber from V8 CallSite objects
 * to find where the function was defined in generated code, then searches for a
 * name mapping near that position in the source map.
 *
 * The challenge is that V8 points to the start of the function (e.g., `function` keyword),
 * but the name mapping in source maps is typically at the identifier position. We search
 * forward from the enclosing position to find the nearest name.
 *
 * @param capturedFrame - The captured frame with enclosing position info
 * @param nameMappings - Cached name mappings from the source map
 * @param mangledName - The mangled function name from the stack trace (already formatted with typeName and async)
 * @param generatedSource - The generated source file content for validation
 * @returns The resolved function name, or the mangled name if resolution fails
 */
function resolveFunctionName(
  capturedFrame: CapturedFrame,
  nameMappings: NameMappingsByLine | undefined,
  mangledName: string,
  generatedSource: string | null
): string {
  // Try to find the original function name using the enclosing function position
  // This is only available in V8 (Node.js), not in Bun (JSC)
  if (
    capturedFrame.enclosingLineNumber !== undefined &&
    capturedFrame.enclosingColumnNumber !== undefined &&
    nameMappings
  ) {
    const foundName = findNameAtPosition(
      nameMappings,
      capturedFrame.enclosingLineNumber,
      capturedFrame.enclosingColumnNumber - 1, // Convert to 0-indexed
      generatedSource,
      capturedFrame.functionName // The raw function name from V8
    )

    if (foundName) {
      // Found the original function name in the source map
      // Format it with typeName and async/constructor prefixes to match the mangledName format
      return formatMethodName(
        foundName,
        capturedFrame.methodName,
        capturedFrame.typeName,
        capturedFrame.isAsync,
        capturedFrame.isConstructor
      )
    }
  }

  // Fallback: clean up the mangled name (which already has typeName and async)
  let methodName = mangledName
  if (methodName) {
    methodName = methodName
      .replace('__WEBPACK_DEFAULT_EXPORT__', 'default')
      .replace('__webpack_exports__.', '')
  }

  return methodName
}

interface SourceMappedFrame {
  stack: IgnorableStackFrame
  // DEV only
  code: string | null
  /**
   * Original V8 CallSite.toString() result for unsourcemapped frames.
   * When present, this should be used directly for output instead of
   * formatting from stack fields - V8's native formatting handles all
   * edge cases (numeric names, special chars, async, constructor, etc.).
   */
  originalString?: string
}

/**
 * Format a method name with optional type name prefix and async/constructor modifiers.
 * V8 uses the format "[async] [new] TypeName.methodName" for method calls.
 *
 * Note: The functionName parameter should never have "async " or "new " prefixes.
 * - From V8 CallSite: getFunctionName() returns the bare name
 * - From parsed stacks: prefixes are stripped in convertParsedFrames()
 */
function formatMethodName(
  functionName: string | undefined,
  callSiteMethodName: string | undefined,
  typeName: string | undefined,
  isAsync: boolean,
  isConstructor: boolean = false
): string {
  let result: string

  // Determine the base name to display
  let displayName = functionName ?? callSiteMethodName

  // Webpack module wrapper functions have the module path as their name, e.g.,
  // "(rsc)/./app/page.tsx" or "(ssr)/./app/page.tsx". These are not meaningful
  // function names and should be treated as <unknown>.
  if (displayName && /^\([^)]+\)\/\.\//.test(displayName)) {
    displayName = undefined
  }

  if (displayName) {
    // Include typeName if present (e.g., "Object.then", "Promise.resolve")
    // This matches V8's native formatting, but V8 omits typeName for:
    // - Numeric method names (e.g., webpack module IDs like "7210")
    // - Names starting with special characters (e.g., "(rsc)/./app/page.tsx")
    const shouldOmitTypeName =
      /^\d+$/.test(displayName) || /^[^a-zA-Z_$]/.test(displayName)
    if (typeName && typeName !== 'global' && !shouldOmitTypeName) {
      result = typeName + '.' + displayName
    } else {
      result = displayName
    }

    // Add "[as methodName]" suffix when both functionName and methodName exist
    // This matches V8's format for cases like "Timeout.eval [as _onTimeout]"
    if (
      functionName &&
      callSiteMethodName &&
      functionName !== callSiteMethodName
    ) {
      result += ' [as ' + callSiteMethodName + ']'
    }
  } else {
    // Use '<unknown>' for compatibility with stacktrace-parser which uses this
    // string for frames without a method name (e.g., "at (file.js:1:1)")
    // in the future this should probably be `<anonymous>`
    result = '<unknown>'
  }

  // Add "new " prefix for constructor calls (before async)
  if (isConstructor) {
    result = 'new ' + result
  }

  // Add "async " prefix for async functions
  if (isAsync) {
    result = 'async ' + result
  }

  return result
}

/**
 * Create an unsourcemapped frame from a captured frame.
 * When the frame has an originalString from V8's CallSite.toString(),
 * we store it to use V8's native formatting directly in output.
 */
function createUnsourcemappedFrame(frame: CapturedFrame): SourceMappedFrame {
  const file = frame.fileName ?? null
  // formatMethodName is still needed for methodName field (used by sandwich algorithm, etc.)
  // but originalString will be used for actual output when available
  const methodName = formatMethodName(
    frame.functionName,
    frame.methodName,
    frame.typeName,
    frame.isAsync,
    frame.isConstructor
  )
  return {
    stack: {
      file,
      line1: frame.lineNumber ?? null,
      column1: frame.columnNumber ?? null,
      methodName,
      arguments: [],
      ignored: file !== null && shouldIgnoreListGeneratedFrame(file),
    },
    code: null,
    // Store original V8 string for direct use in output - handles all edge cases
    // (numeric names, special characters, async, constructor, etc.) correctly
    originalString: frame.originalString,
  }
}

function ignoreListAnonymousStackFramesIfSandwiched(
  sourceMappedFrames: Array<{
    stack: IgnorableStackFrame
    code: string | null
    originalString?: string
  }>
) {
  return ignoreListAnonymousStackFramesIfSandwichedGeneric(
    sourceMappedFrames,
    // Native functions (Set.forEach, JSON.stringify, etc.) have null file names
    // when captured via CallSite, but may have '<anonymous>' as string when
    // the frames come from parsing the stack string (fallback path).
    (frame) => frame.stack.file === null || frame.stack.file === '<anonymous>',
    (frame) => frame.stack.ignored,
    (frame) => frame.stack.methodName,
    (frame) => {
      frame.stack.ignored = true
    }
  )
}

/**
 * Source map a captured frame if possible.
 * @param capturedFrame - The captured frame from V8 CallSite
 * @param sourceMapCache - Cache for source map consumers
 * @param inspectOptions - Node.js inspect options
 * @returns The source mapped frame, or unsourcemapped frame if mapping fails
 */
function getSourcemappedFrameIfPossible(
  capturedFrame: CapturedFrame,
  sourceMapCache: SourceMapCache,
  inspectOptions: util.InspectOptions
): SourceMappedFrame {
  const fileName = capturedFrame.fileName
  if (fileName === undefined) {
    return createUnsourcemappedFrame(capturedFrame)
  }

  const sourceMapCacheEntry = sourceMapCache.get(fileName)
  let sourceMapConsumer: SyncSourceMapConsumer
  let sourceMapPayload: ModernSourceMapPayload
  if (sourceMapCacheEntry === undefined) {
    let sourceURL = fileName
    // e.g. "/Users/foo/APP/.next/server/chunks/ssr/[root-of-the-server]__2934a0._.js"
    // or "C:\Users\foo\APP\.next\server\chunks\ssr\[root-of-the-server]__2934a0._.js"
    // will be keyed by Node.js as "file:///APP/.next/server/chunks/ssr/[root-of-the-server]__2934a0._.js".
    // This is likely caused by `callsite.toString()` in `Error.prepareStackTrace converting file URLs to paths.
    //
    // But fileName might also be "webpack-internal:///(rsc)/./app/bad-sourcemap/page.js" or
    // "<anonymous>" or "node:internal/process/task_queues" here
    if (path.isAbsolute(fileName)) {
      sourceURL = url.pathToFileURL(fileName).toString()
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
      sourceMapCache.set(fileName, null)
      // Don't even fall back to the bundler because it might be not as strict
      // with regards to parsing and then we fail later once we consume the
      // source map payload.
      // This essentially avoids a redundant error where we fail here and then
      // later on consumption because the bundler just handed back an invalid
      // source map.
      return createUnsourcemappedFrame(capturedFrame)
    }
    if (maybeSourceMapPayload === undefined) {
      maybeSourceMapPayload = bundlerFindSourceMapPayload(sourceURL)
    }

    if (maybeSourceMapPayload === undefined) {
      return createUnsourcemappedFrame(capturedFrame)
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
      sourceMapCache.set(fileName, null)
      return createUnsourcemappedFrame(capturedFrame)
    }
    sourceMapCache.set(fileName, {
      map: sourceMapConsumer,
      payload: sourceMapPayload,
      nameMappings: buildNameMappings(sourceMapConsumer),
    })
  } else if (sourceMapCacheEntry === null) {
    // We failed earlier getting the payload or consumer.
    // Just return an unsourcemapped frame.
    // Errors will already be logged.
    return createUnsourcemappedFrame(capturedFrame)
  } else {
    sourceMapConsumer = sourceMapCacheEntry.map
    sourceMapPayload = sourceMapCacheEntry.payload
  }

  // Get or build the name mappings for this source map
  const cacheEntry = sourceMapCache.get(fileName)
  const nameMappings = cacheEntry?.nameMappings

  // Get the generated source for name validation (lazy load and cache)
  let generatedSource = cacheEntry?.generatedSource
  if (generatedSource === undefined && cacheEntry) {
    generatedSource = readGeneratedSource(fileName)
    cacheEntry.generatedSource = generatedSource
  }

  const lineNumber = capturedFrame.lineNumber ?? 1
  const columnNumber = capturedFrame.columnNumber ?? 1

  const sourcePosition = sourceMapConsumer.originalPositionFor({
    column: columnNumber - 1,
    line: lineNumber,
  })

  const applicableSourceMap = findApplicableSourceMapPayload(
    lineNumber - 1,
    columnNumber - 1,
    sourceMapPayload
  )
  let ignored =
    applicableSourceMap !== undefined &&
    sourceMapIgnoreListsEverything(applicableSourceMap)

  // Compute the full mangled name including typeName and constructor prefix for proper formatting
  const mangledName = formatMethodName(
    capturedFrame.functionName,
    capturedFrame.methodName,
    capturedFrame.typeName,
    capturedFrame.isAsync,
    capturedFrame.isConstructor
  )

  if (sourcePosition.source === null) {
    return {
      stack: {
        arguments: [],
        file: fileName,
        line1: lineNumber,
        column1: columnNumber,
        methodName: mangledName,
        ignored: ignored || shouldIgnoreListGeneratedFrame(fileName),
      },
      code: null,
    }
  }

  // TODO(veil): Upstream a method to sourcemap consumer that immediately says if a frame is ignored or not.
  if (applicableSourceMap === undefined) {
    console.error(
      'No applicable source map found in sections for frame',
      capturedFrame
    )
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
    // Parse methodName format: [async] [new] [TypeName.]functionName[ [as methodName]]
    // We need to extract just the functionName part for deobfuscation
    let funcStart = 0
    let funcEnd = methodName.length

    // Skip "async " prefix
    if (methodName.startsWith('async ')) {
      funcStart = 6
    }
    // Skip "new " prefix
    if (methodName.startsWith('new ', funcStart)) {
      funcStart += 4
    }

    // Find " [as methodName]" suffix
    const asIndex = methodName.indexOf(' [as ', funcStart)
    if (asIndex !== -1) {
      funcEnd = asIndex
    }

    // Find TypeName. prefix (after async/new, before [as])
    const dotIndex = methodName.lastIndexOf('.', funcEnd)
    if (dotIndex !== -1 && dotIndex >= funcStart) {
      funcStart = dotIndex + 1
    }

    const rawFunctionName = methodName.slice(funcStart, funcEnd)

    const deobfuscatedName = findNameAtPosition(
      getNameMappings(sourceMapCacheEntry),
      enclosingPosition.line,
      enclosingPosition.column - 1, // Convert to 0-indexed
      getGeneratedSource(sourceMapCacheEntry),
      rawFunctionName
    )

    if (deobfuscatedName) {
      // Replace the function name portion, keeping prefix and suffix
      methodName =
        methodName.slice(0, funcStart) +
        deobfuscatedName +
        methodName.slice(funcEnd)
    }
  }

  const originalFrame: IgnorableStackFrame = {
    methodName,
    file: sourcePosition.source,
    line1: sourcePosition.line,
    column1: sourcePosition.column !== null ? sourcePosition.column + 1 : null,
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

  // Access error.stack to ensure prepareStackTrace is called and captures the stack data.
  // The stack property is lazily computed, so this triggers the capture.
  const stackString = error.stack

  // Get the captured stack trace data from the WeakMap
  const capturedStack = capturedStackTraces.get(error)
  const errorName = capturedStack?.name ?? computeErrorName(error)

  // Get frames from captured data, or fall back to parsing the stack string.
  // The WeakMap lookup can fail when error objects are cloned/serialized
  // across process boundaries (e.g., during prerendering).
  let frames: CapturedFrame[]
  if (capturedStack) {
    frames = capturedStack.frames
  } else if (stackString) {
    // Parse the stack string to extract frames for filtering.
    // Wrap in try-catch to avoid infinite recursion if parsing fails.
    try {
      frames = parseFrames(stackString)
    } catch {
      // If parsing fails, return the original stack string as-is
      return stackString
    }
  } else {
    return `${errorName}: ${error.message}`
  }
  if (!showIgnoreListed) {
    const reactBottomIdx = frames.findIndex(
      (f) =>
        f.functionName?.includes('react_stack_bottom_frame') ||
        f.functionName?.includes('react-stack-bottom-frame')
    )
    if (reactBottomIdx !== -1) {
      frames = frames.slice(0, reactBottomIdx)
    }
  }

  const sourceMapCache: SourceMapCache = new Map()

  const sourceMappedFrames: Array<{
    stack: IgnorableStackFrame
    code: string | null
    originalString?: string
  }> = []
  let sourceFrame: null | string = null
  for (const frame of frames) {
    const sourcemappedFrame = getSourcemappedFrameIfPossible(
      frame,
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

  ignoreListAnonymousStackFramesIfSandwiched(sourceMappedFrames)

  let sourceMappedStack = ''
  for (let i = 0; i < sourceMappedFrames.length; i++) {
    const frame = sourceMappedFrames[i]

    // Note: We don't use frame.originalString here because V8's formatting
    // includes absolute paths and doesn't match our desired output format.
    // The formatMethodName function handles method name edge cases (numeric
    // names, special characters, etc.) to match V8's behavior.
    const frameStr = frameToString(
      frame.stack.methodName,
      frame.stack.file,
      frame.stack.line1,
      frame.stack.column1
    )

    if (!frame.stack.ignored) {
      sourceMappedStack += '\n' + frameStr
    } else if (showIgnoreListed) {
      sourceMappedStack += '\n' + dim(frameStr)
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
