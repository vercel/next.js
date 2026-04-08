import { cyan, dim, red, yellow } from '../../../lib/picocolors'
import type { Project } from '../../../build/swc/types'
import util from 'util'
import {
  getConsoleLocation,
  getSourceMappedStackFrames,
  withLocation,
  type MappingContext,
} from './source-map'
import {
  type ServerLogEntry,
  type LogMethod,
  type ConsoleEntry,
  UNDEFINED_MARKER,
} from '../../../next-devtools/shared/forward-logs-shared'
import { configure } from 'next/dist/compiled/safe-stable-stringify'
import {
  getLogStream,
  methodToLevel,
  type LogLevel as LogStreamLevel,
} from '../log-stream'

export function restoreUndefined(x: any): any {
  if (x === UNDEFINED_MARKER) return undefined
  if (Array.isArray(x)) return x.map(restoreUndefined)
  if (x && typeof x === 'object') {
    for (let k in x) {
      x[k] = restoreUndefined(x[k])
    }
  }
  return x
}

const methods: Array<LogMethod> = [
  'log',
  'info',
  'warn',
  'debug',
  'table',
  'error',
  'assert',
  'dir',
  'dirxml',
  'group',
  'groupCollapsed',
  'groupEnd',
]

const methodsToSkipInspect = new Set([
  'table',
  'dir',
  'dirxml',
  'group',
  'groupCollapsed',
  'groupEnd',
])

// we aren't overriding console, we're just making a (slightly convoluted) helper for replaying user console methods
const forwardConsole: typeof console = {
  ...console,
  ...Object.fromEntries(
    methods.map((method) => [
      method,
      (...args: Array<any>) =>
        (console[method] as any)(
          ...args.map((arg) =>
            methodsToSkipInspect.has(method) ||
            typeof arg !== 'object' ||
            arg === null
              ? arg
              : // we hardcode depth:Infinity to allow the true depth to be configured by the serialization done in the browser (which is controlled by user)
                util.inspect(arg, { depth: Infinity, colors: true })
          )
        ),
    ])
  ),
}

async function deserializeArgData(arg: any) {
  try {
    // we want undefined to be represented as it would be in the browser from the user's perspective (otherwise it would be stripped away/shown as null)
    if (arg === UNDEFINED_MARKER) {
      return restoreUndefined(arg)
    }

    return restoreUndefined(JSON.parse(arg))
  } catch {
    return arg
  }
}

const colorError = (
  mapped: Awaited<ReturnType<typeof getSourceMappedStackFrames>>,
  config?: {
    prefix?: string
    applyColor?: boolean
  }
) => {
  const colorFn =
    config?.applyColor === undefined || config.applyColor ? red : <T>(x: T) => x
  switch (mapped.kind) {
    case 'mapped-stack':
    case 'stack': {
      return (
        (config?.prefix ? colorFn(config?.prefix) : '') +
        `\n${colorFn(mapped.stack)}`
      )
    }
    case 'with-frame-code': {
      return (
        (config?.prefix ? colorFn(config?.prefix) : '') +
        `\n${colorFn(mapped.stack)}\n${mapped.frameCode}`
      )
    }
    // a more sophisticated version of this allows the user to config if they want ignored frames (but we need to be sure to source map them)
    case 'all-ignored': {
      return config?.prefix ? colorFn(config?.prefix) : ''
    }
    default: {
    }
  }
  mapped satisfies never
}

/** Regex to detect console format specifiers (%s, %d, %i, %f, %o, %O, %c) */
const FORMAT_SPECIFIER_REGEX = /%[sdifcoO]/

/**
 * Process console format strings to expand specifiers.
 * Otherwise we'd see the format specifier directly in terminal output.
 */
function processConsoleFormatStrings(args: any[]): any[] {
  if (args.length > 0 && typeof args[0] === 'string') {
    if (FORMAT_SPECIFIER_REGEX.test(args[0])) {
      try {
        return [util.format(...args)]
      } catch {
        return args
      }
    }
  }
  return args
}

// in the case of logging errors, we want to strip formatting
// modifiers since we apply our own custom coloring to error
// stacks and code blocks, and otherwise it would conflict
// and cause awful output
export function stripFormatSpecifiers(args: any[]): any[] {
  if (args.length === 0 || typeof args[0] !== 'string') return args

  const fmtIn = String(args[0])
  const rest = args.slice(1)

  if (!fmtIn.includes('%')) return args

  let fmtOut = ''
  let argPtr = 0

  for (let i = 0; i < fmtIn.length; i++) {
    if (fmtIn[i] !== '%') {
      fmtOut += fmtIn[i]
      continue
    }

    if (fmtIn[i + 1] === '%') {
      fmtOut += '%'
      i++
      continue
    }

    const token = fmtIn[++i]

    if (!token) {
      fmtOut += '%'
      continue
    }

    if ('csdifoOj'.includes(token) || token === 'O') {
      if (argPtr < rest.length) {
        if (token === 'c') {
          argPtr++
        } else if (token === 'o' || token === 'O' || token === 'j') {
          const obj = rest[argPtr++]
          fmtOut += util.inspect(obj, { depth: 2, colors: false })
        } else {
          // string(...) is safe for remaining specifiers
          fmtOut += String(rest[argPtr++])
        }
      }
      continue
    }

    fmtOut += '%' + token
  }

  const result = [fmtOut]
  if (argPtr < rest.length) {
    result.push(...rest.slice(argPtr))
  }

  return result
}

async function prepareFormattedErrorArgs(
  entry: Extract<ServerLogEntry, { kind: 'formatted-error' }>,
  ctx: MappingContext,
  distDir: string
) {
  const mapped = await getSourceMappedStackFrames(entry.stack, ctx, distDir)
  return [colorError(mapped, { prefix: entry.prefix })]
}

async function prepareConsoleArgs(
  entry: Extract<ServerLogEntry, { kind: 'console' }>,
  ctx: MappingContext,
  distDir: string
) {
  const deserialized = await Promise.all(
    entry.args.map(async (arg) => {
      if (arg.kind === 'arg') {
        const data = await deserializeArgData(arg.data)
        if (entry.method === 'warn' && typeof data === 'string') {
          return yellow(data)
        }
        return data
      }
      if (!arg.stack) return red(arg.prefix)
      const mapped = await getSourceMappedStackFrames(arg.stack, ctx, distDir)
      return colorError(mapped, { prefix: arg.prefix, applyColor: false })
    })
  )

  return processConsoleFormatStrings(deserialized)
}

async function prepareConsoleErrorArgs(
  entry: Extract<ServerLogEntry, { kind: 'any-logged-error' }>,
  ctx: MappingContext,
  distDir: string
) {
  const deserialized = await Promise.all(
    entry.args.map(async (arg) => {
      if (arg.kind === 'arg') {
        if (arg.isRejectionMessage) return red(arg.data)
        return deserializeArgData(arg.data)
      }
      if (!arg.stack) return red(arg.prefix)
      const mapped = await getSourceMappedStackFrames(arg.stack, ctx, distDir)
      return colorError(mapped, { prefix: arg.prefix })
    })
  )

  const mappedStack = await getSourceMappedStackFrames(
    entry.consoleErrorStack,
    ctx,
    distDir
  )

  /**
   * don't show the stack + codeblock when there are errors present, since:
   * - it will look overwhelming to see 2 stacks and 2 code blocks
   * - the user already knows where the console.error is at because we append the location
   */
  const location = getConsoleLocation(mappedStack)
  if (entry.args.some((a) => a.kind === 'formatted-error-arg')) {
    const result = stripFormatSpecifiers(deserialized)
    if (location) {
      result.push(dim(`(${location})`))
    }
    return result
  }
  const result = [
    ...processConsoleFormatStrings(deserialized),
    colorError(mappedStack),
  ]
  if (location) {
    result.push(dim(`(${location})`))
  }
  return result
}

async function handleTable(
  entry: ConsoleEntry<string>,
  browserPrefix: string,
  ctx: MappingContext,
  distDir: string
) {
  const deserializedArgs = await Promise.all(
    entry.args.map(async (arg: any) => {
      if (arg.kind === 'formatted-error-arg') {
        return { stack: arg.stack }
      }
      return deserializeArgData(arg.data)
    })
  )

  const location = entry.consoleMethodStack
    ? getConsoleLocation(
        await getSourceMappedStackFrames(entry.consoleMethodStack, ctx, distDir)
      )
    : undefined

  forwardConsole.log(browserPrefix)
  forwardConsole.table(...deserializedArgs)
  if (location) {
    forwardConsole.log(dim(`(${location})`))
  }
}

async function handleTrace(
  entry: ConsoleEntry<string>,
  browserPrefix: string,
  ctx: MappingContext,
  distDir: string
) {
  const deserializedArgs = await Promise.all(
    entry.args.map(async (arg: any) => {
      if (arg.kind === 'formatted-error-arg') {
        if (!arg.stack) return red(arg.prefix)
        const mapped = await getSourceMappedStackFrames(arg.stack, ctx, distDir)
        return colorError(mapped, { prefix: arg.prefix })
      }
      return deserializeArgData(arg.data)
    })
  )

  if (!entry.consoleMethodStack) {
    forwardConsole.log(
      browserPrefix,
      ...deserializedArgs,
      '[Trace unavailable]'
    )
    return
  }

  const [mapped, mappedIgnored] = await Promise.all([
    getSourceMappedStackFrames(entry.consoleMethodStack, ctx, distDir, false),
    getSourceMappedStackFrames(entry.consoleMethodStack, ctx, distDir),
  ])

  const location = getConsoleLocation(mappedIgnored)
  forwardConsole.log(
    browserPrefix,
    ...deserializedArgs,
    `\n${mapped.stack}`,
    ...(location ? [`\n${dim(`(${location})`)}`] : [])
  )
}

async function handleDir(
  entry: ConsoleEntry<string>,
  browserPrefix: string,
  ctx: MappingContext,
  distDir: string
) {
  const loggableEntry = await prepareConsoleArgs(entry, ctx, distDir)
  const consoleMethod =
    (forwardConsole as any)[entry.method] || forwardConsole.log

  if (entry.consoleMethodStack) {
    const mapped = await getSourceMappedStackFrames(
      entry.consoleMethodStack,
      ctx,
      distDir
    )
    const location = dim(`(${getConsoleLocation(mapped)})`)
    const originalWrite = process.stdout.write.bind(process.stdout)
    let captured = ''
    process.stdout.write = (chunk) => {
      captured += chunk
      return true
    }
    try {
      consoleMethod(...loggableEntry)
    } finally {
      process.stdout.write = originalWrite
    }
    originalWrite(
      `${browserPrefix}${captured.replace(/\r?\n$/, '')} ${location}\n`
    )
    return
  }
  consoleMethod(browserPrefix, ...loggableEntry)
}

async function handleDefaultConsole(
  entry: ConsoleEntry<string>,
  browserPrefix: string,
  consoleArgs: any[],
  ctx: MappingContext,
  distDir: string,
  config: BrowserLogConfig
) {
  const withStackEntry = await withLocation(
    {
      original: consoleArgs,
      stack: entry.consoleMethodStack || null,
    },
    ctx,
    distDir,
    config
  )
  const consoleMethod = forwardConsole[entry.method] || forwardConsole.log
  ;(consoleMethod as (...args: any[]) => void)(browserPrefix, ...withStackEntry)
}

type FilterLevel = 'error' | 'warn' | 'verbose'

type BrowserLogConfig =
  | boolean
  | FilterLevel
  | { level?: FilterLevel; showSourceLocation?: boolean }

// LogStream level priority (higher = more severe)
const LOG_LEVEL_PRIORITY: Record<LogStreamLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

// Map filter config to minimum LogStream level threshold
const CONFIG_TO_MIN_LEVEL: Record<FilterLevel, LogStreamLevel> = {
  verbose: 'debug', // show everything
  warn: 'warn', // show warn + error
  error: 'error', // show only error
}

function shouldShowEntry(
  entry: ServerLogEntry,
  config: BrowserLogConfig
): boolean {
  // If config is false, don't show any entries
  if (config === false) {
    return false
  }

  // Determine the effective filter level from config
  const filterLevel: FilterLevel =
    typeof config === 'string'
      ? config
      : config === true
        ? 'verbose' // true means show everything
        : typeof config === 'object'
          ? (config.level ?? 'verbose') // object config defaults to verbose for backward compatibility
          : 'warn' // default for new installations

  // Convert filter level to minimum LogStream level threshold
  const minLevel = CONFIG_TO_MIN_LEVEL[filterLevel]
  const minPriority = LOG_LEVEL_PRIORITY[minLevel]

  // Get the entry's LogStream level
  let entryLevel: LogStreamLevel
  if (entry.kind === 'formatted-error' || entry.kind === 'any-logged-error') {
    entryLevel = 'error'
  } else if (entry.kind === 'console') {
    entryLevel = methodToLevel(entry.method)
  } else {
    return false
  }

  // Show entry if its priority meets or exceeds the minimum threshold
  return LOG_LEVEL_PRIORITY[entryLevel] >= minPriority
}

const safeStringify = configure({ maximumDepth: 5, maximumBreadth: 100 })

/** Format args to a clean string for LogStream file logging */
function formatArgsForLogStream(args: any[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg
      if (typeof arg === 'number' || typeof arg === 'boolean')
        return String(arg)
      if (arg === null) return 'null'
      if (arg === undefined) return 'undefined'
      return safeStringify(arg) ?? '[Unable to view]'
    })
    .join(' ')
}

export async function handleLog(
  entries: ServerLogEntry[],
  ctx: MappingContext,
  distDir: string,
  config: BrowserLogConfig
): Promise<void> {
  const isServerLog = ctx.isServer || ctx.isEdgeServer
  const browserPrefix = isServerLog ? cyan('[server]') : cyan('[browser]')
  const logSource = isServerLog ? 'userland' : ('browser' as const)
  const logStream = getLogStream()

  /** Emit a log entry to LogStream (always, regardless of terminal config) */
  const emitToLogStream = (
    level: LogStreamLevel,
    args: any[],
    entry: ServerLogEntry
  ) => {
    const method =
      entry.kind === 'console'
        ? entry.method.toUpperCase()
        : level.toUpperCase()
    logStream.emit(level, formatArgsForLogStream(args), {
      source: logSource,
      scope: 'console',
      structured: { method },
    })
  }

  for (const entry of entries) {
    const showTerminal = shouldShowEntry(entry, config)
    try {
      switch (entry.kind) {
        case 'console': {
          // Prepare args once — shared between terminal output and LogStream
          const consoleArgs = await prepareConsoleArgs(entry, ctx, distDir)

          switch (entry.method) {
            case 'table': {
              if (showTerminal) {
                await handleTable(entry, browserPrefix, ctx, distDir)
              }
              break
            }
            case 'trace': {
              if (showTerminal) {
                await handleTrace(entry, browserPrefix, ctx, distDir)
              }
              break
            }
            case 'dir': {
              if (showTerminal) {
                await handleDir(entry, browserPrefix, ctx, distDir)
              }
              break
            }
            case 'dirxml':
            case 'group':
            case 'groupCollapsed':
            case 'groupEnd':
            case 'assert':
            case 'log':
            case 'info':
            case 'debug':
            case 'error':
            case 'warn': {
              if (showTerminal) {
                await handleDefaultConsole(
                  entry,
                  browserPrefix,
                  consoleArgs,
                  ctx,
                  distDir,
                  config
                )
              }
              break
            }
            default: {
              entry satisfies never
            }
          }

          // Always emit to LogStream for file/MCP logging
          emitToLogStream(methodToLevel(entry.method), consoleArgs, entry)
          break
        }
        // any logged errors are anything that are logged as "red" in the browser but aren't only an Error (console.error, Promise.reject(100))
        case 'any-logged-error': {
          const consoleArgs = await prepareConsoleErrorArgs(entry, ctx, distDir)
          if (showTerminal) {
            forwardConsole.error(browserPrefix, ...consoleArgs)
          }
          emitToLogStream('error', consoleArgs, entry)
          break
        }
        // formatted error is an explicit error event (rejections, uncaught errors)
        case 'formatted-error': {
          const formattedArgs = await prepareFormattedErrorArgs(
            entry,
            ctx,
            distDir
          )
          if (showTerminal) {
            forwardConsole.error(browserPrefix, ...formattedArgs)
          }
          emitToLogStream('error', formattedArgs, entry)
          break
        }
        default: {
        }
      }
    } catch {
      // Fallback on processing error: emit raw message
      const message =
        entry.kind === 'formatted-error'
          ? `${entry.prefix}\n${entry.stack}`
          : entry.kind === 'console'
            ? entry.args.map((a: any) => a.data ?? a.prefix ?? '').join(' ')
            : 'Error processing log entry'

      if (showTerminal) {
        forwardConsole.error(browserPrefix, message)
      }
      logStream.emit('error', message, { source: logSource, scope: 'console' })
    }
  }
}

// the data is used later when we need to get sourcemaps for error stacks
export async function receiveBrowserLogsWebpack(opts: {
  entries: ServerLogEntry[]
  router: 'app' | 'pages'
  sourceType?: 'server' | 'edge-server'
  clientStats: () => any
  serverStats: () => any
  edgeServerStats: () => any
  rootDirectory: string
  distDir: string
  config: BrowserLogConfig
}): Promise<void> {
  const {
    entries,
    router,
    sourceType,
    clientStats,
    serverStats,
    edgeServerStats,
    rootDirectory,
    distDir,
  } = opts

  const isAppDirectory = router === 'app'
  const isServer = sourceType === 'server'
  const isEdgeServer = sourceType === 'edge-server'

  const ctx: MappingContext = {
    bundler: 'webpack',
    isServer,
    isEdgeServer,
    isAppDirectory,
    clientStats,
    serverStats,
    edgeServerStats,
    rootDirectory,
  }

  await handleLog(entries, ctx, distDir, opts.config)
}

export async function receiveBrowserLogsTurbopack(opts: {
  entries: ServerLogEntry[]
  router: 'app' | 'pages'
  sourceType?: 'server' | 'edge-server'
  project: Project
  projectPath: string
  distDir: string
  config: BrowserLogConfig
}): Promise<void> {
  const { entries, router, sourceType, project, projectPath, distDir } = opts

  const isAppDirectory = router === 'app'
  const isServer = sourceType === 'server'
  const isEdgeServer = sourceType === 'edge-server'

  const ctx: MappingContext = {
    bundler: 'turbopack',
    project,
    projectPath,
    isServer,
    isEdgeServer,
    isAppDirectory,
  }

  await handleLog(entries, ctx, distDir, opts.config)
}
