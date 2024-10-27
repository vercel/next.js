import { findSourceMap, type SourceMapPayload } from 'module'
import * as path from 'path'
import { URL } from 'url'
import type * as util from 'util'
import { SourceMapConsumer as SyncSourceMapConsumer } from 'next/dist/compiled/source-map'
import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import { parseStack } from '../client/components/react-dev-overlay/server/middleware'
import { getOriginalCodeFrame } from '../client/components/react-dev-overlay/server/shared'
import { workUnitAsyncStorage } from './app-render/work-unit-async-storage.external'

interface ModernRawSourceMap extends SourceMapPayload {
  ignoreList?: number[]
}

interface IgnoreableStackFrame extends StackFrame {
  ignored: boolean
}

type SourceMapCache = Map<
  string,
  { map: SyncSourceMapConsumer; raw: ModernRawSourceMap }
>

// TODO: Implement for Edge runtime
const inspectSymbol = Symbol.for('nodejs.util.inspect.custom')

function frameToString(frame: StackFrame): string {
  let sourceLocation = frame.lineNumber !== null ? `:${frame.lineNumber}` : ''
  if (frame.column !== null && sourceLocation !== '') {
    sourceLocation += `:${frame.column}`
  }

  const filePath =
    frame.file !== null &&
    frame.file.startsWith('file://') &&
    URL.canParse(frame.file)
      ? // If not relative to CWD, the path is ambiguous to IDEs and clicking will prompt to select the file first.
        // In a multi-app repo, this leads to potentially larger file names but will make clicking snappy.
        // There's no tradeoff for the cases where `dir` in `next dev [dir]` is omitted
        // since relative to cwd is both the shortest and snappiest.
        path.relative(process.cwd(), new URL(frame.file).pathname)
      : frame.file

  return frame.methodName
    ? `    at ${frame.methodName} (${filePath}${sourceLocation})`
    : `    at ${filePath}${frame.lineNumber}:${frame.column}`
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

function shouldIgnoreListByDefault(file: string): boolean {
  return file.startsWith('node:')
}

function getSourcemappedFrameIfPossible(
  frame: StackFrame,
  sourceMapCache: SourceMapCache
): {
  stack: IgnoreableStackFrame
  // DEV only
  code: string | null
} | null {
  if (frame.file === null) {
    return null
  }

  const sourceMapCacheEntry = sourceMapCache.get(frame.file)
  let sourceMap: SyncSourceMapConsumer
  let rawSourceMap: ModernRawSourceMap
  if (sourceMapCacheEntry === undefined) {
    const moduleSourceMap = findSourceMap(frame.file)
    if (moduleSourceMap === undefined) {
      return null
    }
    rawSourceMap = moduleSourceMap.payload
    sourceMap = new SyncSourceMapConsumer(
      // @ts-expect-error -- Module.SourceMap['version'] is number but SyncSourceMapConsumer wants a string
      rawSourceMap
    )
    sourceMapCache.set(frame.file, {
      map: sourceMap,
      raw: rawSourceMap,
    })
  } else {
    sourceMap = sourceMapCacheEntry.map
    rawSourceMap = sourceMapCacheEntry.raw
  }

  const sourcePosition = sourceMap.originalPositionFor({
    column: frame.column ?? 0,
    line: frame.lineNumber ?? 1,
  })

  if (sourcePosition.source === null) {
    return null
  }

  const sourceContent: string | null =
    sourceMap.sourceContentFor(
      sourcePosition.source,
      /* returnNullOnMissing */ true
    ) ?? null

  // TODO: O(n^2). Consider moving `ignoreList` into a Set
  const sourceIndex = rawSourceMap.sources.indexOf(sourcePosition.source)
  const ignored = rawSourceMap.ignoreList?.includes(sourceIndex) ?? false

  const originalFrame: IgnoreableStackFrame = {
    methodName:
      sourcePosition.name ||
      // default is not a valid identifier in JS so webpack uses a custom variable when it's an unnamed default export
      // Resolve it back to `default` for the method name if the source position didn't have the method.
      frame.methodName
        ?.replace('__WEBPACK_DEFAULT_EXPORT__', 'default')
        ?.replace('__webpack_exports__.', ''),
    column: sourcePosition.column,
    file: sourcePosition.source,
    lineNumber: sourcePosition.line,
    // TODO: c&p from async createOriginalStackFrame but why not frame.arguments?
    arguments: [],
    ignored,
  }

  const codeFrame =
    process.env.NODE_ENV !== 'production'
      ? getOriginalCodeFrame(originalFrame, sourceContent)
      : null

  return {
    stack: originalFrame,
    code: codeFrame,
  }
}

function parseAndSourceMap(error: Error): string {
  // We overwrote Error.prepareStackTrace earlier so error.stack is not sourcemapped.
  let unparsedStack = String(error.stack)
  // We could just read it from `error.stack`.
  // This works around cases where a 3rd party `Error.prepareStackTrace` implementation
  // doesn't implement the name computation correctly.
  const errorName = computeErrorName(error)

  let idx = unparsedStack.indexOf('react-stack-bottom-frame')
  if (idx !== -1) {
    idx = unparsedStack.lastIndexOf('\n', idx)
  }
  if (idx !== -1) {
    // Cut off everything after the bottom frame since it'll be React internals.
    unparsedStack = unparsedStack.slice(0, idx)
  }

  const unsourcemappedStack = parseStack(unparsedStack)
  const sourceMapCache: SourceMapCache = new Map()

  let sourceMappedStack = ''
  let sourceFrameDEV: null | string = null
  for (const frame of unsourcemappedStack) {
    if (frame.file === null) {
      sourceMappedStack += '\n' + frameToString(frame)
    } else if (!shouldIgnoreListByDefault(frame.file)) {
      const sourcemappedFrame = getSourcemappedFrameIfPossible(
        frame,
        sourceMapCache
      )

      if (sourcemappedFrame === null) {
        sourceMappedStack += '\n' + frameToString(frame)
      } else {
        if (
          process.env.NODE_ENV !== 'production' &&
          sourcemappedFrame.code !== null &&
          sourceFrameDEV === null &&
          // TODO: Is this the right choice?
          !sourcemappedFrame.stack.ignored
        ) {
          sourceFrameDEV = sourcemappedFrame.code
        }
        if (!sourcemappedFrame.stack.ignored) {
          // TODO: Consider what happens if every frame is ignore listed.
          sourceMappedStack += '\n' + frameToString(sourcemappedFrame.stack)
        }
      }
    }
  }

  return (
    errorName +
    ': ' +
    error.message +
    sourceMappedStack +
    (sourceFrameDEV !== null ? '\n' + sourceFrameDEV : '')
  )
}

export function patchErrorInspect() {
  Error.prepareStackTrace = prepareUnsourcemappedStackTrace

  // @ts-expect-error -- TODO upstream types
  // eslint-disable-next-line no-extend-native -- We're not extending but overriding.
  Error.prototype[inspectSymbol] = function (
    depth: number,
    inspectOptions: util.InspectOptions,
    inspect: typeof util.inspect
  ): string {
    // avoid false-positive dynamic i/o warnings e.g. due to usage of `Math.random` in `source-map`.
    return workUnitAsyncStorage.exit(() => {
      // Create a new Error object with the source mapping applied and then use native
      // Node.js formatting on the result.
      const newError =
        this.cause !== undefined
          ? // Setting an undefined `cause` would print `[cause]: undefined`
            new Error(this.message, { cause: this.cause })
          : new Error(this.message)

      // TODO: Ensure `class MyError extends Error {}` prints `MyError` as the name
      newError.stack = parseAndSourceMap(this)

      for (const key in this) {
        if (!Object.prototype.hasOwnProperty.call(newError, key)) {
          // @ts-expect-error -- We're copying all enumerable properties.
          // So they definitely exist on `this` and obviously have no type on `newError` (yet)
          newError[key] = this[key]
        }
      }

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
