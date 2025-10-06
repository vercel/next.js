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
import { formatConsoleArgs } from '../../../client/lib/console'
import { getFileLogger } from './file-logger'

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

function cleanConsoleArgsForFileLogging(args: any[]): string {
  /**
   * Use formatConsoleArgs to strip out background and color format specifiers
   * and keep only the original string content for file logging
   */
  try {
    return formatConsoleArgs(args)
  } catch {
    // Fallback to simple string conversion if formatting fails
    return args
      .map((arg) =>
        typeof arg === 'string' ? arg : util.inspect(arg, { depth: 2 })
      )
      .join(' ')
  }
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

function processConsoleFormatStrings(args: any[]): any[] {
  /**
   * this handles the case formatting is applied to the console log
   * otherwise we will see the format specifier directly in the terminal output
   */
  if (args.length > 0 && typeof args[0] === 'string') {
    const formatString = args[0]
    if (
      formatString.includes('%s') ||
      formatString.includes('%d') ||
      formatString.includes('%i') ||
      formatString.includes('%f') ||
      formatString.includes('%o') ||
      formatString.includes('%O') ||
      formatString.includes('%c')
    ) {
      try {
        const formatted = util.format(...args)
        return [formatted]
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

  const location = await (async () => {
    if (!entry.consoleMethodStack) {
      return
    }
    const frames = await getSourceMappedStackFrames(
      entry.consoleMethodStack,
      ctx,
      distDir
    )
    return getConsoleLocation(frames)
  })()

  // we can't inline pass browser prefix, but it looks better multiline for table anyways
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

  // TODO(rob): refactor so we can re-use result and not re-run the entire source map to avoid trivial post processing
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
    const preserved = captured.replace(/\r?\n$/, '')
    originalWrite(`${browserPrefix}${preserved} ${location}\n`)
    return
  }
  consoleMethod(browserPrefix, ...loggableEntry)
}

async function handleDefaultConsole(
  entry: ConsoleEntry<string>,
  browserPrefix: string,
  ctx: MappingContext,
  distDir: string,
  config: boolean | { logDepth?: number; showSourceLocation?: boolean },
  isServerLog: boolean
) {
  const consoleArgs = await prepareConsoleArgs(entry, ctx, distDir)
  const withStackEntry = await withLocation(
    {
      original: consoleArgs,
      stack: (entry as any).consoleMethodStack || null,
    },
    ctx,
    distDir,
    config
  )
  const consoleMethod = forwardConsole[entry.method] || forwardConsole.log
  ;(consoleMethod as (...args: any[]) => void)(browserPrefix, ...withStackEntry)

  // Process enqueued logs and write to file
  // Log to file with correct source based on context
  const fileLogger = getFileLogger()

  // Use cleaned console args to strip out background and color format specifiers
  const message = cleanConsoleArgsForFileLogging(consoleArgs)
  if (isServerLog) {
    fileLogger.logServer(entry.method.toUpperCase(), message)
  } else {
    fileLogger.logBrowser(entry.method.toUpperCase(), message)
  }
}

export async function handleLog(
  entries: ServerLogEntry[],
  ctx: MappingContext,
  distDir: string,
  config: boolean | { logDepth?: number; showSourceLocation?: boolean }
): Promise<void> {
  // Determine the source based on the context
  const isServerLog = ctx.isServer || ctx.isEdgeServer
  const browserPrefix = isServerLog ? cyan('[server]') : cyan('[browser]')
  const fileLogger = getFileLogger()

  for (const entry of entries) {
    try {
      switch (entry.kind) {
        case 'console': {
          switch (entry.method) {
            case 'table': {
              // timeout based abort on source mapping result
              await handleTable(entry, browserPrefix, ctx, distDir)
              break
            }
            // ignore frames
            case 'trace': {
              await handleTrace(entry, browserPrefix, ctx, distDir)
              break
            }
            case 'dir': {
              await handleDir(entry, browserPrefix, ctx, distDir)
              break
            }
            case 'dirxml': {
              // xml log thing maybe needs an impl
              // fallthrough
            }
            case 'group':
            case 'groupCollapsed':
            case 'groupEnd': {
              // [browser] undefined (app/page.tsx:8:11) console.group
              // fallthrough
            }
            case 'assert': {
              // check console assert
              // fallthrough
            }
            case 'log':
            case 'info':
            case 'debug':
            case 'error':
            case 'warn': {
              await handleDefaultConsole(
                entry,
                browserPrefix,
                ctx,
                distDir,
                config,
                isServerLog
              )
              break
            }
            default: {
              entry satisfies never
            }
          }
          break
        }
        // any logged errors are anything that are logged as "red" in the browser but aren't only an Error (console.error, Promise.reject(100))
        case 'any-logged-error': {
          const consoleArgs = await prepareConsoleErrorArgs(entry, ctx, distDir)
          forwardConsole.error(browserPrefix, ...consoleArgs)

          // Process enqueued logs and write to file
          fileLogger.logBrowser(
            'ERROR',
            cleanConsoleArgsForFileLogging(consoleArgs)
          )
          break
        }
        // formatted error is an explicit error event (rejections, uncaught errors)
        case 'formatted-error': {
          const formattedArgs = await prepareFormattedErrorArgs(
            entry,
            ctx,
            distDir
          )
          forwardConsole.error(browserPrefix, ...formattedArgs)

          // Process enqueued logs and write to file
          fileLogger.logBrowser(
            'ERROR',
            cleanConsoleArgsForFileLogging(formattedArgs)
          )
          break
        }
        default: {
        }
      }
    } catch {
      switch (entry.kind) {
        case 'any-logged-error': {
          const consoleArgs = await prepareConsoleErrorArgs(entry, ctx, distDir)
          forwardConsole.error(browserPrefix, ...consoleArgs)
          // Process enqueued logs and write to file
          fileLogger.logBrowser(
            'ERROR',
            cleanConsoleArgsForFileLogging(consoleArgs)
          )
          break
        }
        case 'console': {
          const consoleMethod =
            forwardConsole[entry.method] || forwardConsole.log
          const consoleArgs = await prepareConsoleArgs(entry, ctx, distDir)
          ;(consoleMethod as (...args: any[]) => void)(
            browserPrefix,
            ...consoleArgs
          )

          // Process enqueued logs and write to file
          fileLogger.logBrowser(
            'ERROR',
            cleanConsoleArgsForFileLogging(consoleArgs)
          )
          break
        }
        case 'formatted-error': {
          forwardConsole.error(browserPrefix, `${entry.prefix}\n`, entry.stack)

          // Process enqueued logs and write to file
          fileLogger.logBrowser(
            'ERROR',
            cleanConsoleArgsForFileLogging([`${entry.prefix}\n${entry.stack}`])
          )
          break
        }
        default: {
        }
      }
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
  config: boolean | { logDepth?: number; showSourceLocation?: boolean }
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
  config: boolean | { logDepth?: number; showSourceLocation?: boolean }
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

// Handle client file logs (always logged regardless of terminal flag)
export async function handleClientFileLogs(
  logs: Array<{ timestamp: string; level: string; message: string }>
): Promise<void> {
  const fileLogger = getFileLogger()

  for (const log of logs) {
    fileLogger.logBrowser(log.level, log.message)
  }
}
