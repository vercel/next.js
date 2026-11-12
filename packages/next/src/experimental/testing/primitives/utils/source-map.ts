import type { OriginalMapping } from '@jridgewell/trace-mapping'
import type { ParsedStack, TestError } from './types'
import { originalPositionFor } from '@jridgewell/trace-mapping'
import { resolve } from 'pathe'
import { isPrimitive, notNullish } from './helpers'

export interface StackTraceParserOptions {
  ignoreStackEntries?: (RegExp | string)[]
  getSourceMap?: (file: string) => unknown
  getUrlId?: (id: string) => string
  frameFilter?: (error: TestError, frame: ParsedStack) => boolean | void
}

const CHROME_IE_STACK_REGEXP = /^\s*at .*(?:\S:\d+|\(native\))/m
const SAFARI_NATIVE_CODE_REGEXP = /^(?:eval@)?(?:\[native code\])?$/

const stackIgnorePatterns: (string | RegExp)[] = [
  'node:internal',
  /\/packages\/\w+\/dist\//,
  /\/@vitest\/\w+\/dist\//,
  '/vitest/dist/',
  '/vitest/src/',
  '/packages/expect/src/',
  '/packages/snapshot/src/',
  '/node_modules/chai/',
  '/node_modules/tinyspy/',
  '/vite/dist/node/module-runner',
  '/rolldown-vite/dist/node/module-runner',
  // browser related deps
  '/deps/chunk-',
  '/deps/@vitest',
  '/deps/loupe',
  '/deps/chai',
  '/browser-playwright/dist/locators.js',
  '/browser-webdriverio/dist/locators.js',
  '/browser-preview/dist/locators.js',
  /node:\w+/,
  /__vitest_test__/,
  /__vitest_browser__/,
  '/@id/__x00__vitest/browser',
  /\/deps\/vitest_/,
  '/deps/vitest.js',
]

export { stackIgnorePatterns as defaultStackIgnorePatterns }

const NOW_LENGTH = Date.now().toString().length
const REGEXP_VITEST = new RegExp(`vitest=\\d{${NOW_LENGTH}}`)

function extractLocation(urlLike: string) {
  // Fail-fast but return locations like "(native)"
  if (!urlLike.includes(':')) {
    return [urlLike]
  }

  const regExp = /(.+?)(?::(\d+))?(?::(\d+))?$/
  const parts = regExp.exec(urlLike.replace(/^\(|\)$/g, ''))
  if (!parts) {
    return [urlLike]
  }
  let url = parts[1]
  if (url.startsWith('async ')) {
    url = url.slice(6)
  }
  if (url.startsWith('http:') || url.startsWith('https:')) {
    const urlObj = new URL(url)
    urlObj.searchParams.delete('import')
    urlObj.searchParams.delete('browserv')
    url = tryDecode(urlObj.pathname, decodeURI) + urlObj.hash + urlObj.search
  }
  if (url.startsWith('/@fs/')) {
    const isWindows = /^\/@fs\/[a-zA-Z]:\//.test(url)
    url = url.slice(isWindows ? 5 : 4)
  }
  if (url.includes('vitest=')) {
    url = url.replace(REGEXP_VITEST, '').replace(/[?&]$/, '')
  }
  return [url, parts[2] || undefined, parts[3] || undefined]
}

function tryDecode(value: string, decode: (value: string) => string): string {
  try {
    return decode(value)
  } catch {
    return value
  }
}

export function parseSingleFFOrSafariStack(raw: string): ParsedStack | null {
  let line = raw.trim()

  if (SAFARI_NATIVE_CODE_REGEXP.test(line)) {
    return null
  }

  if (line.includes(' > eval')) {
    line = line.replace(
      / line (\d+)(?: > eval line \d+)* > eval:\d+:\d+/g,
      ':$1'
    )
  }

  // Early return for lines that don't look like Firefox/Safari stack traces
  // Firefox/Safari stack traces must contain '@' and should have location info after it
  if (!line.includes('@')) {
    return null
  }

  // Find the correct @ that separates function name from location
  // For cases like '@https://@fs/path' or 'functionName@https://@fs/path'
  // we need to find the first @ that precedes a valid location (containing :)
  let atIndex = -1
  let locationPart = ''
  let functionName: string | undefined

  // Try each @ from left to right to find the one that gives us a valid location
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '@') {
      const candidateLocation = line.slice(i + 1)
      // Minimum length 3 for valid location: 1 for filename + 1 for colon + 1 for line number (e.g., "a:1")
      if (candidateLocation.includes(':') && candidateLocation.length >= 3) {
        atIndex = i
        locationPart = candidateLocation
        functionName = i > 0 ? line.slice(0, i) : undefined
        break
      }
    }
  }

  // Validate we found a valid location with minimum length (filename:line format)
  if (
    atIndex === -1 ||
    !locationPart.includes(':') ||
    locationPart.length < 3
  ) {
    return null
  }
  const [url, lineNumber, columnNumber] = extractLocation(locationPart)

  if (!url || !lineNumber || !columnNumber) {
    return null
  }

  return {
    file: url,
    method: functionName || '',
    line: Number.parseInt(lineNumber),
    column: Number.parseInt(columnNumber),
  }
}

export function parseSingleStack(raw: string): ParsedStack | null {
  const line = raw.trim()
  if (!CHROME_IE_STACK_REGEXP.test(line)) {
    return parseSingleFFOrSafariStack(line)
  }
  return parseSingleV8Stack(line)
}

// Based on https://github.com/stacktracejs/error-stack-parser
// Credit to stacktracejs
export function parseSingleV8Stack(raw: string): ParsedStack | null {
  let line = raw.trim()

  if (!CHROME_IE_STACK_REGEXP.test(line)) {
    return null
  }

  if (line.includes('(eval ')) {
    line = line
      .replace(/eval code/g, 'eval')
      .replace(/(\(eval at [^()]*)|(,.*$)/g, '')
  }

  let sanitizedLine = line
    .replace(/^\s+/, '')
    .replace(/\(eval code/g, '(')
    .replace(/^.*?\s+/, '')

  // capture and preserve the parenthesized location "(/foo/my bar.js:12:87)" in
  // case it has spaces in it, as the string is split on \s+ later on
  const location = sanitizedLine.match(/ (\(.+\)$)/)

  // remove the parenthesized location from the line, if it was matched
  sanitizedLine = location
    ? sanitizedLine.replace(location[0], '')
    : sanitizedLine

  // if a location was matched, pass it to extractLocation() otherwise pass all sanitizedLine
  // because this line doesn't have function name
  const [url, lineNumber, columnNumber] = extractLocation(
    location ? location[1] : sanitizedLine
  )
  let method = (location && sanitizedLine) || ''
  let file = url && ['eval', '<anonymous>'].includes(url) ? undefined : url

  if (!file || !lineNumber || !columnNumber) {
    return null
  }

  if (method.startsWith('async ')) {
    method = method.slice(6)
  }

  if (file.startsWith('file://')) {
    // pathToFileURL also encodes "#" and "?", which decodeURI keeps
    file = tryDecode(file.slice(7), decodeURIComponent)
  }

  // normalize Windows path (\ -> /)
  file =
    file.startsWith('node:') || file.startsWith('internal:')
      ? file
      : resolve(file)

  if (method) {
    method = method
      // vite 7+
      .replace(/\(0\s?,\s?__vite_ssr_import_\d+__.(\w+)\)/g, '$1')
      // vite <7
      .replace(/__(vite_ssr_import|vi_import)_\d+__\./g, '')
      .replace(/(Object\.)?__vite_ssr_export_default__\s?/g, '')
  }

  return {
    method,
    file,
    line: Number.parseInt(lineNumber),
    column: Number.parseInt(columnNumber),
  }
}

export function createStackString(stacks: ParsedStack[]): string {
  return stacks
    .map((frame) => {
      const line = `${frame.file}:${frame.line}:${frame.column}`
      if (frame.method) {
        return `    at ${frame.method}(${line})`
      }
      return `    at ${line}`
    })
    .join('\n')
}

export function parseStacktrace(
  rawStack: string,
  options: StackTraceParserOptions = {}
): ParsedStack[] {
  const { ignoreStackEntries = stackIgnorePatterns } = options
  let stacks = !CHROME_IE_STACK_REGEXP.test(rawStack)
    ? parseFFOrSafariStackTrace(rawStack)
    : parseV8Stacktrace(rawStack)

  // remove vi.defineHelper's internal stacks
  const helperIndex = stacks.findLastIndex((s) =>
    // this covers cases such as
    //   "__VITEST_HELPER__"
    //   "__VITEST_HELPER__ [as <object method name>]"
    //   "async*__VITEST_HELPER__" (firefox)
    //   "async __VITEST_HELPER__" (webkit)
    s.method.includes('__VITEST_HELPER__')
  )
  if (helperIndex >= 0) {
    stacks = stacks.slice(helperIndex + 1)
  }

  return stacks
    .map((frame) => {
      if (options.getUrlId) {
        frame.file = options.getUrlId(frame.file)
      }

      const map = options.getSourceMap?.(frame.file) as
        | SourceMapLike
        | null
        | undefined
      if (!map || typeof map !== 'object' || !map.version) {
        return shouldFilter(ignoreStackEntries, frame.file) ? null : frame
      }

      const traceMap = new DecodedMap(map, frame.file)
      if (frame.line <= 0 || frame.column <= 0) {
        return frame
      }
      const position = getOriginalPosition(traceMap, {
        line: frame.line,
        // stacktrace's column is 1-indexed, but sourcemap's one is 0-indexed
        column: frame.column - 1,
      })
      if (!position) {
        return frame
      }

      const { line, column, source, name } = position
      let file = source || frame.file
      if (/\/\w:\//.test(file)) {
        file = file.slice(1)
      }

      if (shouldFilter(ignoreStackEntries, file)) {
        return null
      }

      if (line != null && column != null) {
        return {
          line,
          column: column + 1,
          file,
          method: name || frame.method,
        }
      }
      return frame
    })
    .filter((s) => s != null)
}

function shouldFilter(
  ignoreStackEntries: (string | RegExp)[],
  file: string
): boolean {
  return ignoreStackEntries.some((p) => file.match(p))
}

function parseFFOrSafariStackTrace(frame: string): ParsedStack[] {
  return frame
    .split('\n')
    .map((line) => parseSingleFFOrSafariStack(line))
    .filter(notNullish)
}

function parseV8Stacktrace(stack: string): ParsedStack[] {
  return stack
    .split('\n')
    .map((line) => parseSingleV8Stack(line))
    .filter(notNullish)
}

export function parseErrorStacktrace(
  e: TestError | Error,
  options: StackTraceParserOptions = {}
): ParsedStack[] {
  if (!e || isPrimitive(e)) {
    return []
  }

  if ('stacks' in e && e.stacks) {
    return e.stacks
  }

  const stackStr = e.stack || ''
  // if "stack" property was overwritten at runtime to be something else,
  // ignore the value because we don't know how to process it
  let stackFrames =
    typeof stackStr === 'string' ? parseStacktrace(stackStr, options) : []

  if (!stackFrames.length) {
    const e_ = e as any
    if (
      e_.fileName != null &&
      e_.lineNumber != null &&
      e_.columnNumber != null
    ) {
      stackFrames = parseStacktrace(
        `${e_.fileName}:${e_.lineNumber}:${e_.columnNumber}`,
        options
      )
    }
    if (e_.sourceURL != null && e_.line != null && e_._column != null) {
      stackFrames = parseStacktrace(
        `${e_.sourceURL}:${e_.line}:${e_.column}`,
        options
      )
    }
  }

  if (options.frameFilter) {
    stackFrames = stackFrames.filter(
      (f) => options.frameFilter!(e as TestError, f) !== false
    )
  }

  ;(e as TestError).stacks = stackFrames
  return stackFrames
}

interface SourceMapLike {
  version: number
  mappings?: string
  names?: string[]
  sources?: string[]
  sourcesContent?: string[]
  sourceRoot?: string
}

interface Needle {
  line: number
  column: number
}

export class DecodedMap {
  _encoded: string
  _decoded: undefined | number[][][]
  _decodedMemo: Stats
  url: string
  version: number
  names: string[] = []
  resolvedSources: string[]

  constructor(
    public map: SourceMapLike,
    from: string
  ) {
    const { mappings, names, sources } = map
    this.version = map.version
    this.names = names || []
    this._encoded = mappings || ''
    this._decodedMemo = memoizedState()
    this.url = from
    this.resolvedSources = (sources || []).map((s) =>
      resolve(from, '..', s || '')
    )
  }
}

interface Stats {
  lastKey: number
  lastNeedle: number
  lastIndex: number
}

function memoizedState(): Stats {
  return {
    lastKey: -1,
    lastNeedle: -1,
    lastIndex: -1,
  }
}

export function getOriginalPosition(
  map: DecodedMap,
  needle: Needle
): OriginalMapping | null {
  const result = originalPositionFor(map as any, needle)
  if (result.column == null) {
    return null
  }
  return result
}
