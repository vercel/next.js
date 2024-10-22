import { findSourceMap } from 'module'
import type * as util from 'util'
import { SourceMapConsumer as SyncSourceMapConsumer } from 'next/dist/compiled/source-map'
import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import { parseStack } from '../client/components/react-dev-overlay/server/middleware'
import { getOriginalCodeFrame } from '../client/components/react-dev-overlay/server/shared'

// TODO: Implement for Edge runtime
const inspectSymbol = Symbol.for('nodejs.util.inspect.custom')

function frameToString(frame: StackFrame): string {
  return frame.methodName
    ? `    at ${frame.methodName} (${frame.file}:${frame.lineNumber}:${frame.column})`
    : `    at ${frame.file}:${frame.lineNumber}:${frame.column}`
}

function prepareUnsourcemappedStackTrace(
  error: Error,
  structuredStackTrace: any[]
): string {
  const name = error.name || 'Error'
  const message = error.message || ''
  let stack = name + ': ' + message
  for (let i = 0; i < structuredStackTrace.length; i++) {
    stack += '\n    at ' + structuredStackTrace[i].toString()
  }
  return stack
}

function shouldIgnoreListByDefault(file: string): boolean {
  return (
    // TODO: Solve via `ignoreList` instead. Tricky because node internals are not part of the sourcemap.
    file.startsWith('node:') ||
    // C&P from setup-dev-bundler
    // TODO: Taken from setup-dev-bundler but these seem too broad
    // file.includes('web/adapter') ||
    // file.includes('web/globals') ||
    // file.includes('sandbox/context') ||
    // TODO: Seems too aggressive?
    file.includes('<anonymous>') ||
    file.startsWith('eval')
  )
}

function getSourcemappedFrameIfPossible(
  frame: StackFrame,
  sourcemapConsumers: Map<string, SyncSourceMapConsumer>
): {
  stack: StackFrame
  // DEV only
  code: string | null
} | null {
  if (frame.file === null) {
    return null
  }

  let sourcemap = sourcemapConsumers.get(frame.file)
  if (sourcemap === undefined) {
    const moduleSourcemap = findSourceMap(frame.file)
    if (moduleSourcemap === undefined) {
      return null
    }
    sourcemap = new SyncSourceMapConsumer(
      // @ts-expect-error -- Module.SourceMap['version'] is number but SyncSourceMapConsumer wants a string
      moduleSourcemap.payload
    )
    sourcemapConsumers.set(frame.file, sourcemap)
  }

  const sourcePosition = sourcemap.originalPositionFor({
    column: frame.column ?? 0,
    line: frame.lineNumber ?? 1,
  })

  if (sourcePosition.source === null) {
    return null
  }

  const sourceContent: string | null =
    sourcemap.sourceContentFor(
      sourcePosition.source,
      /* returnNullOnMissing */ true
    ) ?? null

  const originalFrame: StackFrame = {
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
  }

  return {
    stack: originalFrame,
    code:
      process.env.NODE_ENV !== 'production'
        ? getOriginalCodeFrame(originalFrame, sourceContent)
        : null,
  }
}

function parseAndSourceMap(error: Error): string {
  // We overwrote Error.prepareStackTrace earlier so error.stack is not sourcemapped.
  let unparsedStack = String(error.stack)

  let idx = unparsedStack.indexOf('react-stack-bottom-frame')
  if (idx !== -1) {
    idx = unparsedStack.lastIndexOf('\n', idx)
  }
  if (idx !== -1) {
    // Cut off everything after the bottom frame since it'll be React internals.
    unparsedStack = unparsedStack.slice(0, idx)
  }

  const unsourcemappedStack = parseStack(unparsedStack)
  const sourcemapConsumers = new Map<string, SyncSourceMapConsumer>()

  let sourceMappedStack = ''
  let sourceFrameDEV: null | string = null
  for (const frame of unsourcemappedStack) {
    if (frame.file === null) {
      sourceMappedStack += '\n' + frameToString(frame)
    } else if (!shouldIgnoreListByDefault(frame.file)) {
      const sourcemappedFrame = getSourcemappedFrameIfPossible(
        frame,
        sourcemapConsumers
      )

      if (sourcemappedFrame === null) {
        sourceMappedStack += '\n' + frameToString(frame)
      } else {
        // TODO: Use the first frame that's not ignore-listed
        if (
          process.env.NODE_ENV !== 'production' &&
          sourcemappedFrame.code !== null &&
          sourceFrameDEV !== null
        ) {
          sourceFrameDEV = sourcemappedFrame.code
        }
        // TODO: Hide if ignore-listed but consider what happens if every frame is ignore listed.
        sourceMappedStack += '\n' + frameToString(sourcemappedFrame.stack)
      }
    }
  }

  return (
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
    // Create a new Error object with the source mapping applied and then use native
    // Node.js formatting on the result.
    const newError =
      this.cause !== undefined
        ? // Setting an undefined `cause` would print `[cause]: undefined`
          new Error(this.message, { cause: this.cause })
        : new Error(this.message)

    // TODO: Ensure `class MyError extends Error {}` prints `MyError` as the name
    newError.stack = parseAndSourceMap(this)

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
  }
}
