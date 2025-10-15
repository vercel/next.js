import {
  getOwnerStack,
  setOwnerStackIfAvailable,
} from './errors/stitched-error'
import { getErrorSource } from '../../../shared/lib/error-source'
import { getIsTerminalLoggingEnabled } from './terminal-logging-config'
import {
  type ConsoleEntry,
  type ConsoleErrorEntry,
  type FormattedErrorEntry,
  type ClientLogEntry,
  type LogMethod,
  patchConsoleMethod,
} from '../../shared/forward-logs-shared'
import {
  preLogSerializationClone,
  logStringify,
  safeStringifyWithDepth,
} from './forward-logs-utils'

// Client-side file logger for browser logs
class ClientFileLogger {
  private logEntries: Array<{
    timestamp: string
    level: string // log level
    message: string // log message
  }> = []

  private formatTimestamp(): string {
    const now = new Date()
    const hours = now.getHours().toString().padStart(2, '0')
    const minutes = now.getMinutes().toString().padStart(2, '0')
    const seconds = now.getSeconds().toString().padStart(2, '0')
    const milliseconds = now.getMilliseconds().toString().padStart(3, '0')

    return `${hours}:${minutes}:${seconds}.${milliseconds}`
  }

  log(level: string, args: any[]): void {
    if (isReactServerReplayedLog(args)) {
      return
    }

    // Format the args into a message string
    const message = args
      .map((arg) => {
        if (typeof arg === 'string') return arg
        if (typeof arg === 'number' || typeof arg === 'boolean')
          return String(arg)
        if (arg === null) return 'null'
        if (arg === undefined) return 'undefined'
        return safeStringifyWithDepth(arg)
      })
      .join(' ')

    const logEntry = {
      timestamp: this.formatTimestamp(),
      level: level.toUpperCase(),
      message,
    }
    this.logEntries.push(logEntry)

    // Schedule flush when new log is added
    scheduleLogFlush()
  }
  getLogs(): Array<{ timestamp: string; level: string; message: string }> {
    return [...this.logEntries]
  }

  clear(): void {
    this.logEntries = []
  }
}

const clientFileLogger = new ClientFileLogger()

// Set up flush-based sending of client file logs
let logFlushTimeout: NodeJS.Timeout | null = null
let heartbeatInterval: NodeJS.Timeout | null = null

const scheduleLogFlush = () => {
  if (logFlushTimeout) {
    clearTimeout(logFlushTimeout)
  }

  logFlushTimeout = setTimeout(() => {
    sendClientFileLogs()
    logFlushTimeout = null
  }, 100) // Send after 100ms (much faster with debouncing)
}

const cancelLogFlush = () => {
  if (logFlushTimeout) {
    clearTimeout(logFlushTimeout)
    logFlushTimeout = null
  }
}

const startHeartbeat = () => {
  if (heartbeatInterval) return

  heartbeatInterval = setInterval(() => {
    if (logQueue.socket && logQueue.socket.readyState === WebSocket.OPEN) {
      try {
        // Send a ping to keep the connection alive
        logQueue.socket.send(JSON.stringify({ event: 'ping' }))
      } catch (error) {
        // Connection might be closed, stop heartbeat
        stopHeartbeat()
      }
    } else {
      stopHeartbeat()
    }
  }, 5000) // Send ping every 5 seconds
}

const stopHeartbeat = () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }
}

const isTerminalLoggingEnabled = getIsTerminalLoggingEnabled()

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

// Function to send client file logs to server
const sendClientFileLogs = () => {
  if (!logQueue.socket || logQueue.socket.readyState !== WebSocket.OPEN) {
    return
  }

  const logs = clientFileLogger.getLogs()
  if (logs.length === 0) {
    return
  }

  try {
    const payload = JSON.stringify({
      event: 'client-file-logs',
      logs: logs,
    })

    logQueue.socket.send(payload)
  } catch (error) {
    console.error(error)
  } finally {
    // Clear logs regardless of send success to prevent memory leaks
    clientFileLogger.clear()
  }
}

// Combined state and public API
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

        // Also send client file logs
        sendClientFileLogs()
      } catch {
        // error (make sure u don't infinite loop)
        /* noop */
      }
    })
  },
  onSocketReady: (socket: WebSocket) => {
    // When MCP or terminal logging is enabled, we enable the socket connection,
    // otherwise it will not proceed.
    if (!isTerminalLoggingEnabled && !process.env.__NEXT_MCP_SERVER) {
      return
    }
    if (socket.readyState !== WebSocket.OPEN) {
      // invariant
      return
    }

    // incase an existing timeout was going to run with a stale socket
    logQueue.cancelFlush?.()
    logQueue.socket = socket

    // Add socket event listeners to track connection state
    socket.addEventListener('close', () => {
      cancelLogFlush()
      stopHeartbeat()
    })

    // Only send terminal logs if enabled
    if (isTerminalLoggingEnabled) {
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
    }

    // Always send client file logs when socket is ready
    sendClientFileLogs()

    // Start heartbeat to keep connection alive
    startHeartbeat()
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
  // Always log to client file logger with args (formatting done inside log method)
  clientFileLogger.log(level, args)

  // Only forward to terminal if enabled
  if (!isTerminalLoggingEnabled) {
    return
  }

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
  // Always log to client file logger with args (formatting done inside log method)
  clientFileLogger.log('error', args)
  // Only forward to terminal if enabled
  if (!isTerminalLoggingEnabled) {
    return
  }

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
  // Always log to client file logger
  const message =
    reason instanceof Error
      ? `${reason.name}: ${reason.message}`
      : JSON.stringify(reason)
  clientFileLogger.log('error', [`unhandledRejection: ${message}`])

  // Only forward to terminal if enabled
  if (!isTerminalLoggingEnabled) {
    return
  }

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

/**
 * Matches the format of logs arguments React replayed from the RSC.
 */
const isReactServerReplayedLog = (args: any[]) => {
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

  return format.startsWith('%c%s%c') && styles.includes('background:')
}

export function forwardUnhandledError(error: Error) {
  // Always log to client file logger
  clientFileLogger.log('error', [
    `uncaughtError: ${error.name}: ${error.message}`,
  ])

  // Only forward to terminal if enabled
  if (!isTerminalLoggingEnabled) {
    return
  }

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
        if (isReactServerReplayedLog(args)) {
          return
        }
        createLogEntry(method, args)
      })
    )
  } catch {}
  logQueue.router = router
  isPatched = true

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    cancelLogFlush()
    stopHeartbeat()
    // Send any remaining logs before page unloads
    sendClientFileLogs()
  })
}
