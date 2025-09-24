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
import { preLogSerializationClone, logStringify } from './forward-logs-utils'

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
      } catch {
        // error (make sure u don't infinite loop)
        /* noop */
      }
    })
  },
  onSocketReady: (socket: WebSocket) => {
    if (!isTerminalLoggingEnabled) {
      return
    }

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
  if (!isTerminalLoggingEnabled) {
    return
  }

  createUncaughtErrorEntry(error.name, error.message, stackWithOwners(error))
}

// TODO: this router check is brittle, we need to update based on the current router the user is using
export const initializeDebugLogForwarding = (router: 'app' | 'pages'): void => {
  if (!isTerminalLoggingEnabled) {
    return
  }

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
