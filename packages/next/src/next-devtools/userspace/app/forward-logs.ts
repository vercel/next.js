import { configure } from 'next/dist/compiled/safe-stable-stringify'
import {
  getOwnerStack,
  setOwnerStackIfAvailable,
} from './errors/stitched-error'
import { getErrorSource } from '../../../shared/lib/error-source'
import {
  getTerminalLoggingConfig,
  getIsTerminalLoggingEnabled,
} from './terminal-logging-config'
import {
  type ConsoleEntry,
  type ConsoleErrorEntry,
  type FormattedErrorEntry,
  type ClientLogEntry,
  type LogMethod,
  patchConsoleMethod,
  UNDEFINED_MARKER,
} from '../../shared/forward-logs-shared'

const terminalLoggingConfig = getTerminalLoggingConfig()
export const PROMISE_MARKER = 'Promise {}'
export const UNAVAILABLE_MARKER = '[Unable to view]'

const maximumDepth =
  typeof terminalLoggingConfig === 'object' && terminalLoggingConfig.depthLimit
    ? terminalLoggingConfig.depthLimit
    : 5
const maximumBreadth =
  typeof terminalLoggingConfig === 'object' && terminalLoggingConfig.edgeLimit
    ? terminalLoggingConfig.edgeLimit
    : 100

const stringify = configure({
  maximumDepth,
  maximumBreadth,
})

export const isTerminalLoggingEnabled = getIsTerminalLoggingEnabled()

const methods: Array<LogMethod> = [
  'log',
  'info',
  'warn',
  'debug',
  'table',
  'assert',
  'dir',
  'dirxml',
  'group',
  'groupCollapsed',
  'groupEnd',
  'trace',
]
/**
 * allows us to:
 * - revive the undefined log in the server as it would look in the browser
 * - not read/attempt to serialize promises (next will console error if you do that, and will cause this program to infinitely recurse)
 * - if we read a proxy that throws (no way to detect if something is a proxy), explain to the user we can't read this data
 */
export function preLogSerializationClone<T>(
  value: T,
  seen = new WeakMap()
): any {
  if (value === undefined) return UNDEFINED_MARKER
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value as object)) return seen.get(value as object)

  try {
    Object.keys(value as object)
  } catch {
    return UNAVAILABLE_MARKER
  }

  try {
    if (typeof (value as any).then === 'function') return PROMISE_MARKER
  } catch {
    return UNAVAILABLE_MARKER
  }

  if (Array.isArray(value)) {
    const out: any[] = []
    seen.set(value, out)
    for (const item of value) {
      try {
        out.push(preLogSerializationClone(item, seen))
      } catch {
        out.push(UNAVAILABLE_MARKER)
      }
    }
    return out
  }

  const proto = Object.getPrototypeOf(value)
  if (proto === Object.prototype || proto === null) {
    const out: Record<string, unknown> = {}
    seen.set(value as object, out)
    for (const key of Object.keys(value as object)) {
      try {
        out[key] = preLogSerializationClone((value as any)[key], seen)
      } catch {
        out[key] = UNAVAILABLE_MARKER
      }
    }
    return out
  }

  return Object.prototype.toString.call(value)
}

// only safe if passed safeClone data
export const logStringify = (data: unknown): string => {
  try {
    const result = stringify(data)
    return result ?? `"${UNAVAILABLE_MARKER}"`
  } catch {
    return `"${UNAVAILABLE_MARKER}"`
  }
}

const afterThisFrame = (cb: () => void) => {
  let timeout: ReturnType<typeof setTimeout> | undefined

  const rafId = requestAnimationFrame(() => {
    timeout = setTimeout(() => {
      cb()
    })
  })

  return () => {
    cancelAnimationFrame(rafId)
    clearTimeout(timeout)
  }
}

let isPatched = false

const serializeEntries = (entries: Array<ClientLogEntry>) =>
  entries.map((clientEntry) => {
    switch (clientEntry.kind) {
      case 'any-logged-error':
      case 'console': {
        return {
          ...clientEntry,
          args: clientEntry.args.map(stringifyUserArg),
        }
      }
      case 'formatted-error': {
        return clientEntry
      }
      default: {
        return null!
      }
    }
  })

export const logQueue: {
  entries: Array<ClientLogEntry>
  onSocketReady: (socket: WebSocket) => void
  flushScheduled: boolean
  socket: WebSocket | null
  cancelFlush: (() => void) | null
  sourceType?: 'server' | 'edge-server'
  router: 'app' | 'pages' | null
  scheduleLogSend: (entry: ClientLogEntry) => void
} = {
  entries: [],
  flushScheduled: false,
  cancelFlush: null,
  socket: null,
  sourceType: undefined,
  router: null,
  scheduleLogSend: (entry: ClientLogEntry) => {
    logQueue.entries.push(entry)
    if (logQueue.flushScheduled) {
      return
    }
    // safe to deref and use in setTimeout closure since we cancel on new socket
    const socket = logQueue.socket
    if (!socket) {
      return
    }

    // we probably dont need this
    logQueue.flushScheduled = true

    // non blocking log flush, runs at most once per frame
    logQueue.cancelFlush = afterThisFrame(() => {
      logQueue.flushScheduled = false

      // just incase
      try {
        const payload = JSON.stringify({
          event: 'browser-logs',
          entries: serializeEntries(logQueue.entries),
          router: logQueue.router,
          // needed for source mapping, we just assign the sourceType from the last error for the whole batch
          sourceType: logQueue.sourceType,
        })

        socket.send(payload)
        logQueue.entries = []
        logQueue.sourceType = undefined
      } catch {
        // error (make sure u don't infinite loop)
        /* noop */
      }
    })
  },
  onSocketReady: (socket: WebSocket) => {
    if (socket.readyState !== WebSocket.OPEN) {
      // invariant
      return
    }

    // incase an existing timeout was going to run with a stale socket
    logQueue.cancelFlush?.()
    logQueue.socket = socket
    try {
      const payload = JSON.stringify({
        event: 'browser-logs',
        entries: serializeEntries(logQueue.entries),
        router: logQueue.router,
        sourceType: logQueue.sourceType,
      })

      socket.send(payload)
      logQueue.entries = []
      logQueue.sourceType = undefined
    } catch {
      /** noop just incase */
    }
  },
}

const stringifyUserArg = (
  arg:
    | {
        kind: 'arg'
        data: unknown
      }
    | {
        kind: 'formatted-error-arg'
      }
) => {
  if (arg.kind !== 'arg') {
    return arg
  }
  return {
    ...arg,
    data: logStringify(arg.data),
  }
}

const createErrorArg = (error: Error) => {
  const stack = stackWithOwners(error)
  return {
    kind: 'formatted-error-arg' as const,
    prefix: error.message ? `${error.name}: ${error.message}` : `${error.name}`,
    stack,
  }
}

const createLogEntry = (level: LogMethod, args: any[]) => {
  // do not abstract this, it implicitly relies on which functions call it. forcing the inlined implementation makes you think about callers
  // error capture stack trace maybe
  const stack = stackWithOwners(new Error())
  const stackLines = stack?.split('\n')
  const cleanStack = stackLines?.slice(3).join('\n') // this is probably ignored anyways
  const entry: ConsoleEntry<unknown> = {
    kind: 'console',
    consoleMethodStack: cleanStack ?? null, // depending on browser we might not have stack
    method: level,
    args: args.map((arg) => {
      if (arg instanceof Error) {
        return createErrorArg(arg)
      }
      return {
        kind: 'arg',
        data: preLogSerializationClone(arg),
      }
    }),
  }

  logQueue.scheduleLogSend(entry)
}

export const forwardErrorLog = (args: any[]) => {
  const errorObjects = args.filter((arg) => arg instanceof Error)
  const first = errorObjects.at(0)
  if (first) {
    const source = getErrorSource(first)
    if (source) {
      logQueue.sourceType = source
    }
  }
  /**
   * browser shows stack regardless of type of data passed to console.error, so we should do the same
   *
   * do not abstract this, it implicitly relies on which functions call it. forcing the inlined implementation makes you think about callers
   */
  const stack = stackWithOwners(new Error())
  const stackLines = stack?.split('\n')
  const cleanStack = stackLines?.slice(3).join('\n')

  const entry: ConsoleErrorEntry<unknown> = {
    kind: 'any-logged-error',
    method: 'error',
    consoleErrorStack: cleanStack ?? '',
    args: args.map((arg) => {
      if (arg instanceof Error) {
        return createErrorArg(arg)
      }
      return {
        kind: 'arg',
        data: preLogSerializationClone(arg),
      }
    }),
  }

  logQueue.scheduleLogSend(entry)
}

const createUncaughtErrorEntry = (
  errorName: string,
  errorMessage: string,
  fullStack: string
) => {
  const entry: FormattedErrorEntry = {
    kind: 'formatted-error',
    prefix: `Uncaught ${errorName}: ${errorMessage}`,
    stack: fullStack,
    method: 'error',
  }

  logQueue.scheduleLogSend(entry)
}

const stackWithOwners = (error: Error) => {
  let ownerStack = ''
  setOwnerStackIfAvailable(error)
  ownerStack = getOwnerStack(error) || ''
  const stack = (error.stack || '') + ownerStack
  return stack
}

export function logUnhandledRejection(reason: unknown) {
  if (reason instanceof Error) {
    createUnhandledRejectionErrorEntry(reason, stackWithOwners(reason))
    return
  }
  createUnhandledRejectionNonErrorEntry(reason)
}

const createUnhandledRejectionErrorEntry = (
  error: Error,
  fullStack: string
) => {
  const source = getErrorSource(error)
  if (source) {
    logQueue.sourceType = source
  }

  const entry: ClientLogEntry = {
    kind: 'formatted-error',
    prefix: `⨯ unhandledRejection: ${error.name}: ${error.message}`,
    stack: fullStack,
    method: 'error',
  }

  logQueue.scheduleLogSend(entry)
}

const createUnhandledRejectionNonErrorEntry = (reason: unknown) => {
  const entry: ClientLogEntry = {
    kind: 'any-logged-error',
    // we can't access the stack since the event is dispatched async and creating an inline error would be meaningless
    consoleErrorStack: '',
    method: 'error',
    args: [
      {
        kind: 'arg',
        data: `⨯ unhandledRejection:`,
        isRejectionMessage: true,
      },
      {
        kind: 'arg',
        data: preLogSerializationClone(reason),
      },
    ],
  }

  logQueue.scheduleLogSend(entry)
}

const isHMR = (args: any[]) => {
  const firstArg = args[0]
  if (typeof firstArg !== 'string') {
    return false
  }
  if (firstArg.startsWith('[Fast Refresh]')) {
    return true
  }

  if (firstArg.startsWith('[HMR]')) {
    return true
  }

  return false
}

const isIgnoredLog = (args: any[]) => {
  if (args.length < 3) {
    return false
  }

  const [format, styles, label] = args

  if (
    typeof format !== 'string' ||
    typeof styles !== 'string' ||
    typeof label !== 'string'
  ) {
    return false
  }

  // kinda hacky, we should define a common format for these strings so we can safely ignore
  return format.startsWith('%c%s%c') && styles.includes('background:')
}

export function forwardUnhandledError(error: Error) {
  createUncaughtErrorEntry(error.name, error.message, stackWithOwners(error))
}

// TODO: this router check is brittle, we need to update based on the current router the user is using
export const initializeDebugLogForwarding = (router: 'app' | 'pages'): void => {
  // probably don't need this
  if (isPatched) {
    return
  }
  // TODO(rob): why does this break rendering on server, important to know incase the same bug appears in browser
  if (typeof window === 'undefined') {
    return
  }

  // better to be safe than sorry
  try {
    methods.forEach((method) =>
      patchConsoleMethod(method, (_, ...args) => {
        if (isHMR(args)) {
          return
        }
        if (isIgnoredLog(args)) {
          return
        }
        createLogEntry(method, args)
      })
    )
  } catch {}
  logQueue.router = router
  isPatched = true
}
